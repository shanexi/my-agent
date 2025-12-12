/**
 * Message Processor Service
 * Orchestrates the message processing flow
 */
import { injectable, inject } from 'inversify';
import { Effect, Console, Fiber, Cause, Exit } from 'effect';
import type { Fiber as FiberType } from 'effect';
import { TelegramService, TelegramServiceImpl } from './telegram.service.js';
import { ClaudeService, ClaudeServiceImpl } from './claude.service.js';
import { CostService, CostServiceImpl } from './cost.service.js';
import { InterruptedError } from '../errors/index.js';

export const MessageProcessorService = Symbol.for('MessageProcessorService');

@injectable()
export class MessageProcessorServiceImpl {
  // 只存储 Fiber（不需要 AbortController）
  // 使用 unknown 作为错误类型，因为 fork 的 Effect 可能包含多种错误
  private activeFibers: Map<string, FiberType.RuntimeFiber<void, unknown>> =
    new Map();

  constructor(
    @inject(TelegramService) private telegram: TelegramServiceImpl,
    @inject(ClaudeService) private claude: ClaudeServiceImpl,
    @inject(CostService) private cost: CostServiceImpl
  ) {}

  processAndRespond = Effect.fn('MessageProcessor.processAndRespond')(
    function* (this: MessageProcessorServiceImpl, chatId: number, text: string) {
      yield* Effect.annotateCurrentSpan('chatId', chatId);
      yield* Effect.annotateCurrentSpan('textLength', text.length);

      // 生成唯一的消息 ID（用于 callback_data）
      const messageId = `${chatId}_${Date.now()}`;
      yield* Effect.annotateCurrentSpan('messageId', messageId);

      // 发送"处理中"消息，带 interrupt button
      const statusMsg = yield* this.telegram.sendMessageWithInterruptButton(
        chatId,
        '⏳ 正在处理您的请求...',
        messageId
      );

      // Fork Fiber
      const fiber = yield* Effect.fork(
        this.doProcess(chatId, text, statusMsg.message_id)
      );
      this.activeFibers.set(messageId, fiber);

      // 等待 Fiber 完成，检查是否中断
      const exitResult = yield* Fiber.await(fiber);
      this.activeFibers.delete(messageId);

      // 检查是否被中断
      if (Exit.isFailure(exitResult) && Cause.isInterruptedOnly(exitResult.cause)) {
        yield* Console.log(`⚠️  Request interrupted: ${messageId}`);
        return yield* Effect.fail(
          new InterruptedError({
            message: 'Request interrupted by user',
            chatId,
            statusMessageId: statusMsg.message_id,
          })
        );
      }

      // 如果是其他错误，让它自然传播
      if (Exit.isFailure(exitResult)) {
        return yield* Effect.failCause(exitResult.cause);
      }
    }
  );

  // 实际处理逻辑（不需要 signal 参数）
  private doProcess = Effect.fn('MessageProcessor.doProcess')(function* (
    this: MessageProcessorServiceImpl,
    chatId: number,
    text: string,
    statusMessageId: number
  ) {
    // Step 1: Process with Claude
    yield* Console.log('Processing with Claude via Bedrock...');
    const response = yield* this.claude.createMessage(text);

    // Step 2: Format response with cost
    const costInfo = response.usage
      ? this.cost.formatCostInfo(response.usage, response.modelName)
      : '';

    // Step 3: Check if response contains a CodeSandbox preview URL
    const urlRegex =
      /https:\/\/[a-zA-Z0-9-]+-\d+\.csb\.app|https:\/\/codesandbox\.io\/[sp]\/[a-zA-Z0-9-]+/g;
    const urls = response.text.match(urlRegex);

    // Step 4: Edit status message to completion
    yield* this.telegram.editMessage(chatId, statusMessageId, '✅ 处理完成');

    // Step 5: Send response
    if (urls && urls.length > 0) {
      // Extract the first URL
      const previewUrl = urls[0];

      // Remove URL from text and clean up
      let cleanedText = response.text.replace(urlRegex, '').trim();

      // Remove common patterns around URLs
      cleanedText = cleanedText
        .replace(/🔗\s*\*\*.*?\*\*/g, '') // Remove "🔗 **...**"
        .replace(/您可以通过以下地址访问应用：?/g, '')
        .replace(/请点击链接查看应用.*?。?/g, '')
        .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
        .trim();

      const finalText = cleanedText + costInfo;

      yield* Console.log(`Sending response with button: ${previewUrl}`);
      yield* this.telegram.sendMessageWithButton(
        chatId,
        finalText,
        '🔗 打开预览',
        previewUrl
      );
    } else {
      // No URL detected, send as normal text
      const finalText = response.text + costInfo;
      yield* Console.log(
        `Sending response to ${chatId}: ${response.text.substring(0, 50)}...`
      );
      yield* this.telegram.sendMessage(chatId, finalText);
    }

    yield* Console.log('Message processed successfully');
  });

  // 处理中断请求（从 webhook callback_query 调用）
  handleInterrupt = Effect.fn('MessageProcessor.handleInterrupt')(function* (
    this: MessageProcessorServiceImpl,
    messageId: string
  ) {
    yield* Effect.annotateCurrentSpan('messageId', messageId);
    yield* Effect.annotateCurrentSpan('operation', 'interrupt');

    const fiber = this.activeFibers.get(messageId);

    if (fiber) {
      yield* Console.log(`🛑 Interrupting operation: ${messageId}`);
      yield* Effect.annotateCurrentSpan('fiberFound', true);

      // 只需要 Fiber.interrupt，Effect 会自动传播到 tryPromise 的 signal
      yield* Fiber.interrupt(fiber);

      yield* Effect.annotateCurrentSpan('interruptSuccess', true);
    } else {
      yield* Console.log(`⚠️  No active operation found: ${messageId}`);
      yield* Effect.annotateCurrentSpan('fiberFound', false);
      yield* Effect.annotateCurrentSpan('reason', 'no_active_operation');
    }
  });

  // 处理 callback_query 中断（组合 interrupt + answerCallbackQuery）
  handleInterruptCallback = Effect.fn('MessageProcessor.handleInterruptCallback')(
    function* (this: MessageProcessorServiceImpl, messageId: string, callbackQueryId: string) {
      yield* Effect.annotateCurrentSpan('messageId', messageId);
      yield* Effect.annotateCurrentSpan('callbackQueryId', callbackQueryId);

      yield* this.handleInterrupt(messageId);

      // Answer callback query
      yield* this.telegram.answerCallbackQuery(callbackQueryId);
    }
  );
}
