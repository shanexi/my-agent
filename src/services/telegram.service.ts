/**
 * Telegram Service
 * Handles all Telegram API interactions
 */
import { injectable, inject } from 'inversify';
import { Effect, Schedule } from 'effect';
import { ConfigService, ConfigServiceImpl } from './config.service.js';
import { TelegramApiError } from '../errors/index.js';

export const TelegramService = Symbol.for('TelegramService');

const TELEGRAM_API_BASE = 'https://api.telegram.org';

@injectable()
export class TelegramServiceImpl {
  constructor(@inject(ConfigService) private config: ConfigServiceImpl) {}

  // 统一的 Telegram API 调用方法
  private callTelegramApi = Effect.fn('TelegramService.callTelegramApi')(
    function* (
      this: TelegramServiceImpl,
      method: string,
      body: Record<string, unknown>,
      timeoutSeconds: number = 10
    ): Generator<any, Response, any> {
      const botToken = yield* this.config.getTelegramBotToken();
      const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;

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
        Effect.timeout(`${timeoutSeconds} seconds`),
        Effect.retry(
          Schedule.exponential('1 second').pipe(
            Schedule.compose(Schedule.recurs(2))
          )
        )
      );

      // 检查响应状态
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

      return response;
    }
  );

  sendMessage = Effect.fn('TelegramService.sendMessage')(function* (
    this: TelegramServiceImpl,
    chatId: number,
    text: string,
    replyMarkup?: any
  ) {
    yield* Effect.annotateCurrentSpan('chatId', chatId);
    yield* Effect.annotateCurrentSpan('textLength', text.length);

    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    yield* this.callTelegramApi('sendMessage', body);
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

    yield* this.callTelegramApi('sendChatAction', { chat_id: chatId, action }, 5);
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

    const body = {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    };

    const response = yield* this.callTelegramApi('sendMessage', body);
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

    const body: Record<string, unknown> = {
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

    yield* this.callTelegramApi('editMessageText', body);
  });

  answerCallbackQuery = Effect.fn('TelegramService.answerCallbackQuery')(
    function* (this: TelegramServiceImpl, callbackQueryId: string) {
      yield* Effect.annotateCurrentSpan('callbackQueryId', callbackQueryId);

      yield* this.callTelegramApi('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
      });
    }
  );
}
