/**
 * Claude Service
 * Handles Claude AI API interactions via AWS Bedrock
 */
import { injectable, inject } from 'inversify';
import { Effect } from 'effect';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { ConfigService, ConfigServiceImpl } from './config.service.js';
import { ClaudeApiError } from '../errors/index.js';
import type { ProcessedMessage } from '../types/telegram.types.js';

export const ClaudeService = Symbol.for('ClaudeService');

@injectable()
export class ClaudeServiceImpl {
  private anthropic: AnthropicBedrock | null = null;

  constructor(@inject(ConfigService) private config: ConfigServiceImpl) {}

  private getClient = Effect.fn('ClaudeService.getClient')(function* (
    this: ClaudeServiceImpl
  ) {
    if (!this.anthropic) {
      const awsRegion = yield* this.config.getAwsRegion();
      const awsAccessKey = yield* this.config.getAwsAccessKey();
      const awsSecretKey = yield* this.config.getAwsSecretKey();

      this.anthropic = new AnthropicBedrock({
        awsRegion,
        awsAccessKey,
        awsSecretKey,
      });
    }
    return this.anthropic;
  });

  createMessage = Effect.fn('ClaudeService.createMessage')(function* (
    this: ClaudeServiceImpl,
    message: string
  ) {
    yield* Effect.annotateCurrentSpan('messageLength', message.length);

    const client = yield* this.getClient();
    const modelName = yield* this.config.getAnthropicModel();

    yield* Effect.annotateCurrentSpan('model', modelName);

    const result = yield* Effect.tryPromise({
      try: () =>
        client.messages.create({
          model: modelName,
          max_tokens: 8192,
          messages: [{ role: 'user', content: message }],
        }),
      catch: (e) =>
        new ClaudeApiError({
          message: `Claude API error: ${e}`,
          stack: e instanceof Error ? e.stack : undefined,
        }),
    });

    const textContent = result.content.find((b) => b.type === 'text');
    const text =
      textContent && 'text' in textContent ? textContent.text : '无法生成响应';

    return {
      text,
      modelName,
      usage: result.usage
        ? {
            input_tokens: result.usage.input_tokens,
            output_tokens: result.usage.output_tokens,
          }
        : undefined,
    } as ProcessedMessage;
  });
}
