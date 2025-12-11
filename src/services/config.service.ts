/**
 * Configuration Service
 * Manages environment variables and application configuration
 */
import { injectable } from 'inversify';
import { Effect } from 'effect';
import { ConfigError } from '../errors/index.js';

export const ConfigService = Symbol.for('ConfigService');

@injectable()
export class ConfigServiceImpl {
  getTelegramBotToken = Effect.fn('ConfigService.getTelegramBotToken')(
    function* () {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        yield* Effect.fail(
          new ConfigError({ message: 'TELEGRAM_BOT_TOKEN not configured' })
        );
      }
      return token;
    }
  );

  getAnthropicModel = Effect.fn('ConfigService.getAnthropicModel')(
    function* () {
      return (
        process.env.ANTHROPIC_MODEL ||
        'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
      );
    }
  );

  getAwsRegion = Effect.fn('ConfigService.getAwsRegion')(function* () {
    return process.env.AWS_REGION || 'us-west-2';
  });

  getAwsAccessKey = Effect.fn('ConfigService.getAwsAccessKey')(function* () {
    const key = process.env.AWS_ACCESS_KEY_ID;
    if (!key) {
      yield* Effect.fail(
        new ConfigError({ message: 'AWS_ACCESS_KEY_ID not configured' })
      );
    }
    return key;
  });

  getAwsSecretKey = Effect.fn('ConfigService.getAwsSecretKey')(function* () {
    const secret = process.env.AWS_SECRET_ACCESS_KEY;
    if (!secret) {
      yield* Effect.fail(
        new ConfigError({ message: 'AWS_SECRET_ACCESS_KEY not configured' })
      );
    }
    return secret;
  });

  getPort = Effect.fn('ConfigService.getPort')(function* () {
    return parseInt(process.env.PORT || '3000');
  });
}
