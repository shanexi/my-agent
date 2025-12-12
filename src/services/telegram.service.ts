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
      Effect.retry(Schedule.recurs(1)) // Retry once for transient network issues
    );
  });

  sendMessageWithInterruptButton = Effect.fn(
    'TelegramService.sendMessageWithInterruptButton'
  )(function* (
    this: TelegramServiceImpl,
    chatId: number,
    text: string,
    callbackData: string
  ) {
    yield* Effect.annotateCurrentSpan('chatId', chatId);
    yield* Effect.annotateCurrentSpan('callbackData', callbackData);

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '🛑 Interrupt',
            callback_data: `interrupt:${callbackData}`,
          },
        ],
      ],
    };

    const botToken = yield* this.config.getTelegramBotToken();
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

    const body = {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    };

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
        Console.error(`Failed to send message with interrupt button: ${error}`)
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

    const result = yield* Effect.tryPromise<any>(() => response.json());
    return result.result; // 返回消息详情，包括 message_id
  });

  editMessage = Effect.fn('TelegramService.editMessage')(function* (
    this: TelegramServiceImpl,
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: any
  ) {
    yield* Effect.annotateCurrentSpan('chatId', chatId);
    yield* Effect.annotateCurrentSpan('messageId', messageId);

    const botToken = yield* this.config.getTelegramBotToken();
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/editMessageText`;

    const body: any = {
      chat_id: chatId,
      message_id: messageId,
      text,
    };
    // 移除 button：传递空的 reply_markup
    if (replyMarkup === undefined) {
      body.reply_markup = { inline_keyboard: [] };
    } else {
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
          message: `Edit message failed: ${e}`,
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
        Console.error(`Failed to edit message: ${error}`)
      )
    );

    if (!response.ok) {
      const errorText = yield* Effect.tryPromise(() => response.text());
      yield* Effect.fail(
        new TelegramApiError({
          message: `Edit message error: ${response.status}`,
          statusCode: response.status,
          responseBody: errorText,
        })
      );
    }
  });

  answerCallbackQuery = Effect.fn('TelegramService.answerCallbackQuery')(
    function* (this: TelegramServiceImpl, callbackQueryId: string) {
      yield* Effect.annotateCurrentSpan('callbackQueryId', callbackQueryId);

      const botToken = yield* this.config.getTelegramBotToken();
      const url = `${TELEGRAM_API_BASE}/bot${botToken}/answerCallbackQuery`;

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQueryId }),
          }),
        catch: (e) =>
          new TelegramApiError({
            message: `Answer callback query failed: ${e}`,
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
          Console.error(`Failed to answer callback query: ${error}`)
        )
      );

      if (!response.ok) {
        yield* Effect.fail(
          new TelegramApiError({
            message: `Answer callback query error: ${response.status}`,
          })
        );
      }
    }
  );
}
