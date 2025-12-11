/**
 * Message Processor Service
 * Orchestrates the message processing flow
 */
import { injectable, inject } from 'inversify';
import { Effect, Console } from 'effect';
import { TelegramService, TelegramServiceImpl } from './telegram.service.js';
import { ClaudeService, ClaudeServiceImpl } from './claude.service.js';
import { CostService, CostServiceImpl } from './cost.service.js';

export const MessageProcessorService = Symbol.for('MessageProcessorService');

@injectable()
export class MessageProcessorServiceImpl {
  constructor(
    @inject(TelegramService) private telegram: TelegramServiceImpl,
    @inject(ClaudeService) private claude: ClaudeServiceImpl,
    @inject(CostService) private cost: CostServiceImpl
  ) {}

  processAndRespond = Effect.fn('MessageProcessor.processAndRespond')(
    function* (this: MessageProcessorServiceImpl, chatId: number, text: string) {
      yield* Effect.annotateCurrentSpan('chatId', chatId);
      yield* Effect.annotateCurrentSpan('textLength', text.length);

      // Step 1: Typing indicator (non-critical, handled locally)
      yield* this.telegram.sendChatAction(chatId, 'typing');

      // Step 2: Process with Claude
      yield* Console.log('Processing with Claude via Bedrock...');
      const response = yield* this.claude.createMessage(text);

      // Step 3: Format response with cost
      const costInfo = response.usage
        ? this.cost.formatCostInfo(response.usage, response.modelName)
        : '';

      // Step 4: Check if response contains a CodeSandbox preview URL
      const urlRegex = /https:\/\/[a-zA-Z0-9-]+-\d+\.csb\.app|https:\/\/codesandbox\.io\/[sp]\/[a-zA-Z0-9-]+/g;
      const urls = response.text.match(urlRegex);

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

      return { success: true };
    }
  );
}
