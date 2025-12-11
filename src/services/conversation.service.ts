/**
 * Conversation Service
 * Manages conversation history for single-user MVP
 */
import { injectable } from 'inversify';
import { Effect, Console } from 'effect';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';

export const ConversationService = Symbol.for('ConversationService');

@injectable()
export class ConversationServiceImpl {
  private messages: MessageParam[] = [];

  /**
   * Get complete conversation history
   */
  getHistory = Effect.fn('ConversationService.getHistory')(function* (
    this: ConversationServiceImpl
  ) {
    yield* Effect.annotateCurrentSpan('historyLength', this.messages.length);
    yield* Console.log(`📚 Getting history: ${this.messages.length} messages`);
    return [...this.messages]; // Return copy to prevent external modifications
  });

  /**
   * Add a message to conversation history
   */
  addMessage = Effect.fn('ConversationService.addMessage')(function* (
    this: ConversationServiceImpl,
    message: MessageParam
  ) {
    this.messages.push(message);
    yield* Effect.annotateCurrentSpan('newHistoryLength', this.messages.length);
    yield* Console.log(
      `💾 Added ${message.role} message | Total: ${this.messages.length}`
    );
  });

  /**
   * Clear all conversation history
   */
  clearHistory = Effect.fn('ConversationService.clearHistory')(function* (
    this: ConversationServiceImpl
  ) {
    const previousLength = this.messages.length;
    this.messages = [];
    yield* Effect.annotateCurrentSpan('clearedCount', previousLength);
    yield* Console.log(`🗑️  Cleared ${previousLength} messages from history`);
  });
}
