/**
 * Telegram Service
 * Handles all Telegram API interactions
 */
import { injectable, inject } from 'inversify';
import { Effect, Console, Schedule } from 'effect';
import { ConfigService, ConfigServiceImpl } from './config.service.js';
import { TelegramApiError } from '../errors/index.js';

export const TelegramService = Symbol.for('TelegramService');

const TELEGRAM_API_BASE = 'https://api.telegram.org';

@injectable()
export class TelegramServiceImpl {
  constructor(@inject(ConfigService) private config: ConfigServiceImpl) {}

  sendMessage = Effect.fn('TelegramService.sendMessage')(function* (
    this: TelegramServiceImpl,
    chatId: number,
    text: string,
    replyMarkup?: any
  ) {
    yield* Effect.annotateCurrentSpan('chatId', chatId);
    yield* Effect.annotateCurrentSpan('textLength', text.length);

    const botToken = yield* this.config.getTelegramBotToken();
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

    const body: any = { chat_id: chatId, text };
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      catch: (e) =>
        new TelegramApiError({
          message: `Fetch failed: ${e}`,
          stack: e instanceof Error ? e.stack : undefined,
        }),
    }).pipe(
      Effect.timeout('10 seconds'),
      Effect.retry(
        Schedule.exponential('1 second').pipe(
          Schedule.compose(Schedule.recurs(2))
        )
      ),
      Effect.tapError((error) =>
        Console.error(`Failed to send message: ${error}`)
      )
    );

    if (!response.ok) {
      const errorText = yield* Effect.tryPromise(() => response.text());
      yield* Effect.fail(
        new TelegramApiError({
          message: `Telegram API error: ${response.status}`,
          statusCode: response.status,
          responseBody: errorText,
        })
      );
    }
  });

  sendMessageWithButton = Effect.fn('TelegramService.sendMessageWithButton')(
    function* (
      this: TelegramServiceImpl,
      chatId: number,
      text: string,
      buttonText: string,
      buttonUrl: string
    ) {
      yield* Effect.annotateCurrentSpan('chatId', chatId);
      yield* Effect.annotateCurrentSpan('buttonUrl', buttonUrl);

      const replyMarkup = {
        inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
      };

      yield* this.sendMessage(chatId, text, replyMarkup);
    }
  );

  sendChatAction = Effect.fn('TelegramService.sendChatAction')(function* (
    this: TelegramServiceImpl,
    chatId: number,
    action: 'typing' = 'typing'
  ) {
    yield* Effect.annotateCurrentSpan('chatId', chatId);
    yield* Effect.annotateCurrentSpan('action', action);

    const botToken = yield* this.config.getTelegramBotToken();
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendChatAction`;

    // Non-critical operation, catch errors locally
    yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action }),
        }),
      catch: (e) =>
        new TelegramApiError({
          message: `Failed to send chat action: ${e}`,
          stack: e instanceof Error ? e.stack : undefined,
        }),
    }).pipe(
      Effect.timeout('5 seconds'),
      Effect.retry(Schedule.recurs(1)), // Retry once for transient network issues
      Effect.tapError((error) => Console.error(`Chat action error: ${error}`)),
      Effect.catchAll(() => Effect.void)
    );
  });
}
