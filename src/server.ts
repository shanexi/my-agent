/**
 * Hono Web Server for Telegram Bot
 * Refactored with InversifyJS + Effect architecture
 */
import 'reflect-metadata';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { Container } from 'inversify';
import { Effect, Console } from 'effect';
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

    // Handle regular messages
    if (update.message?.text) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text!; // Already validated in if condition

      console.log(`Received message from ${chatId}: ${text}`);

      const processor = container.get<MessageProcessorServiceImpl>(
        MessageProcessorService
      );
      const telegram = container.get<TelegramServiceImpl>(TelegramService);

      // Fire-and-forget: 立即返回，让 Effect 在后台运行
      // 这样 callback_query webhook 可以立即被处理
      Effect.runPromise(
        processor.processAndRespond(chatId, text).pipe(
        Effect.catchTags({
          // Interrupted error: User clicked interrupt button
          InterruptedError: (error) =>
            Effect.gen(function* () {
              console.log('Request interrupted:', {
                message: error.message,
                chatId: error.chatId,
              });

              // Edit status message to show interruption (if available)
              if (error.chatId && error.statusMessageId) {
                yield* telegram
                  .editMessage(error.chatId, error.statusMessageId, '❌ 操作已中断')
                  .pipe(
                    Effect.catchAll((e) =>
                      Console.error(`Failed to edit status message: ${e}`)
                    )
                  );
              }
            }),

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
                .pipe(
                  Effect.catchAll((e) =>
                    Console.error(`Failed to send config error message: ${e}`)
                  )
                );

              // TODO: Send alert to admin
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
                .pipe(
                  Effect.catchAll((e) =>
                    Console.error(`Failed to send telegram error message: ${e}`)
                  )
                );
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
                .pipe(
                  Effect.catchAll((e) =>
                    Console.error(`Failed to send claude error message: ${e}`)
                  )
                );
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
                .pipe(
                  Effect.catchAll((e) =>
                    Console.error(`Failed to send tool error message: ${e}`)
                  )
                );
            }),

          // Sandbox error: CodeSandbox operation issue
          SandboxError: (error) =>
            Effect.gen(function* () {
              console.error('Sandbox error:', {
                message: error.message,
                operation: error.operation,
                stack: error.stack,
              });

              const operationMessages: Record<string, string> = {
                resume: '恢复沙箱',
                connect: '连接沙箱',
                writeFile: '写入文件',
                getUrl: '获取预览链接',
                waitForPort: '等待服务启动',
              };

              const operationText =
                operationMessages[error.operation] || error.operation;

              yield* telegram
                .sendMessage(
                  chatId,
                  `抱歉，${operationText}失败。请稍后再试。`
                )
                .pipe(
                  Effect.catchAll((e) =>
                    Console.error(`Failed to send sandbox error message: ${e}`)
                  )
                );
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
              .pipe(
                Effect.catchAll((e) =>
                  Console.error(`Failed to send unknown error message: ${e}`)
                )
              );
          })
        ),
        // Provide tracing layer for webhook requests
        Effect.provide(TracingLive)
      )
    ).catch((error) => {
        // 捕获 unhandled promise rejection
        console.error('Unhandled message processing error:', error);
      });

      return c.json({ ok: true });
    }

    // Handle callback_query (inline button clicks)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;

      console.log(`Received callback_query from ${chatId}: ${data}`);

      if (data.startsWith('interrupt:')) {
        const messageId = data.slice('interrupt:'.length);

        const processor = container.get<MessageProcessorServiceImpl>(
          MessageProcessorService
        );

        await Effect.runPromise(
          processor.handleInterruptCallback(messageId, callbackQuery.id).pipe(
            Effect.catchTags({
              TelegramApiError: (error) =>
                Effect.gen(function* () {
                  console.error('Failed to answer callback query:', {
                    message: error.message,
                    statusCode: error.statusCode,
                  });
                  // Non-critical: callback query answer failed, but interrupt succeeded
                }),
            }),
            Effect.catchAll((error) =>
              Console.error(`Interrupt callback error: ${error}`)
            ),
            Effect.provide(TracingLive)
          )
        );
      }

      return c.json({ ok: true });
    }

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
