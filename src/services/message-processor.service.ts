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
      const responseText = response.usage
        ? response.text +
          this.cost.formatCostInfo(response.usage, response.modelName)
        : response.text;

      // Step 4: Send response
      yield* Console.log(
        `Sending response to ${chatId}: ${response.text.substring(0, 50)}...`
      );
      yield* this.telegram.sendMessage(chatId, responseText);
      yield* Console.log('Message processed successfully');

      return { success: true };
    }
  );
}
