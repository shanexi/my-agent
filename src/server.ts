/**
 * Hono Web Server for Telegram Bot
 * Refactored with InversifyJS + Effect architecture
 */
import 'reflect-metadata';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { Container } from 'inversify';
import { Effect, Layer } from 'effect';
import { TracingLive } from './tracing.layer.js';
import { servicesModule } from './services/index.js';
import {
  MessageProcessorService,
  MessageProcessorServiceImpl,
} from './services/message-processor.service.js';
import {
  TelegramService,
  TelegramServiceImpl,
} from './services/telegram.service.js';
import { ConfigService, ConfigServiceImpl } from './services/config.service.js';
import {
  ConfigError,
  TelegramApiError,
  ClaudeApiError,
  McpToolError,
} from './errors/index.js';
import type { TelegramUpdate } from './types/telegram.types.js';

// Create DI container
const container = new Container();
container.load(servicesModule);

const app = new Hono();

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Telegram bot server is running',
  });
});

// Telegram webhook endpoint
app.post('/webhook', async (c) => {
  try {
    const update: TelegramUpdate = await c.req.json();

    if (!update.message?.text) {
      return c.json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text!; // Already validated above

    console.log(`Received message from ${chatId}: ${text}`);

    const processor = container.get<MessageProcessorServiceImpl>(
      MessageProcessorService
    );
    const telegram = container.get<TelegramServiceImpl>(TelegramService);

    // Use catchTags for fine-grained error handling
    await Effect.runPromise(
      processor.processAndRespond(chatId, text).pipe(
        Effect.catchTags({
          // Config error: Server misconfiguration
          ConfigError: (error) =>
            Effect.gen(function* () {
              console.error('Configuration error:', {
                message: error.message,
                stack: error.stack,
              });

              // Send special message for config errors
              yield* telegram
                .sendMessage(
                  chatId,
                  '抱歉，服务器配置错误。管理员已收到通知。'
                )
                .pipe(Effect.catchAll(() => Effect.void));

              // TODO: Send alert to admin
              return { success: false, error: 'ConfigError' };
            }),

          // Telegram API error: Network or Telegram service issue
          TelegramApiError: (error) =>
            Effect.gen(function* () {
              console.error('Telegram API error:', {
                message: error.message,
                statusCode: error.statusCode,
                responseBody: error.responseBody,
                stack: error.stack,
              });

              // Try to send error message
              yield* telegram
                .sendMessage(
                  chatId,
                  '抱歉，发送消息时遇到网络问题。请稍后再试。'
                )
                .pipe(Effect.catchAll(() => Effect.void));

              return { success: false, error: 'TelegramApiError' };
            }),

          // Claude API error: AI service issue
          ClaudeApiError: (error) =>
            Effect.gen(function* () {
              console.error('Claude API error:', {
                message: error.message,
                stack: error.stack,
              });

              yield* telegram
                .sendMessage(chatId, '抱歉，AI 服务暂时不可用。请稍后再试。')
                .pipe(Effect.catchAll(() => Effect.void));

              return { success: false, error: 'ClaudeApiError' };
            }),

          // MCP Tool error: Tool execution issue
          McpToolError: (error) =>
            Effect.gen(function* () {
              console.error('MCP Tool error:', {
                message: error.message,
                toolName: error.toolName,
                toolInput: error.toolInput,
                stack: error.stack,
              });

              yield* telegram
                .sendMessage(
                  chatId,
                  `抱歉，工具执行失败：${error.toolName}。请稍后再试。`
                )
                .pipe(Effect.catchAll(() => Effect.void));

              return { success: false, error: 'McpToolError' };
            }),
        }),
        // Catch all other unknown errors
        Effect.catchAll((error: unknown) =>
          Effect.gen(function* () {
            const errorType =
              typeof error === 'object' && error !== null
                ? (error as any)._tag ||
                  (error as any).constructor?.name ||
                  'Unknown'
                : 'Unknown';

            console.error('Unknown error:', {
              error,
              errorType,
              stack:
                typeof error === 'object' && error !== null
                  ? (error as any).stack
                  : undefined,
            });

            yield* telegram
              .sendMessage(chatId, '抱歉，处理您的消息时出现了错误。请稍后再试。')
              .pipe(Effect.catchAll(() => Effect.void));

            return { success: false, error: 'UnknownError' };
          })
        ),
        // Provide tracing layer for webhook requests
        Effect.provide(TracingLive)
      )
    );

    return c.json({ ok: true });
  } catch (error) {
    // Catch non-Effect errors (e.g., JSON parsing failures)
    console.error('Webhook handler error:', error);
    return c.json({ ok: true });
  }
});

// Start server
const config = container.get<ConfigServiceImpl>(ConfigService);

const program = Effect.gen(function* () {
  const port = yield* config.getPort();

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`Server is running on http://localhost:${port}`);
});

// Run with tracing layer
Effect.runPromise(
  program.pipe(Effect.provide(TracingLive))
).catch((error: unknown) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
