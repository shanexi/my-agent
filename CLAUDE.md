# CLAUDE.md

## 重要

1. 创建 github issue 只需要 diff，前后3行，不需要列出完成代码 
2. 禁止使用 any
3. type cast 和显式类型着重回复下

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript-based agent project using Effect for functional programming patterns and the Anthropic SDK for AI interactions via AWS Bedrock. The project includes a Telegram bot with a Hono web server for flexible deployment.

## Development Commands

```bash
# Development (with hot reload)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run compiled code
npm run start
```

## Environment Configuration

This project requires a `.env` file for AWS Bedrock and Telegram configuration. Environment variables are loaded using Node.js native `--env-file` flag.

Required environment variables:
- `ANTHROPIC_MODEL` - The Bedrock model ID (e.g., `us.anthropic.claude-sonnet-4-5-20250929-v1:0`)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token from @BotFather
- `AWS_REGION` - AWS region for Bedrock (e.g., `us-west-2`)
- `AWS_ACCESS_KEY_ID` - AWS access key ID
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key

Optional environment variables (for distributed tracing):
- `HONEYCOMB_API_KEY` - Honeycomb API key for distributed tracing
- `HONEYCOMB_DATASET` - Honeycomb dataset name (default: "my-agent")
- `OTEL_EXPORTER_OTLP_ENDPOINT` - Generic OTEL endpoint (alternative to Honeycomb)

If neither Honeycomb nor OTEL endpoint is configured, tracing will be disabled.

Copy `.env.example` to `.env` and configure as needed.

## Architecture

### Technology Stack
- **TypeScript** with ES2022 target and Node16 module resolution
- **Effect** - Functional effect system for type-safe async operations
- **InversifyJS** - Dependency injection framework for better testability and modularity
- **Anthropic Bedrock SDK** (`@anthropic-ai/bedrock-sdk`) - Official open-source SDK for AWS Bedrock
- **AWS Bedrock** - Claude API access via AWS infrastructure
- **Hono** - Fast, lightweight web framework
- **@hono/node-server** - Node.js adapter for Hono
- **OpenTelemetry** - Distributed tracing with Honeycomb integration (optional)

### Code Structure
- `src/server.ts` - Hono web server with webhook endpoint (main entry point)
  - Initializes InversifyJS container and handles HTTP routes
  - Top-level error handling with `Effect.catchTags`
  - Integrates tracing layer via `Effect.provide(TracingLive)`
- `src/tracing.layer.ts` - OpenTelemetry tracing configuration
  - Honeycomb or generic OTEL endpoint support
  - Auto-disables if no tracing config provided
- `src/services/` - Service layer with dependency injection
  - `config.service.ts` - Environment variable management
  - `telegram.service.ts` - Telegram API interactions
  - `claude.service.ts` - Claude AI via AWS Bedrock
  - `cost.service.ts` - Cost calculation and formatting
  - `message-processor.service.ts` - Business logic orchestration
  - `container.module.ts` - InversifyJS container configuration
- `src/errors/` - Custom error types using `Data.TaggedError`
- `src/types/` - TypeScript type definitions
- All TypeScript code compiles to `dist/` directory

### Telegram Bot Architecture

**Webhook Pattern with Hono:**
```
User message -> Telegram -> POST /webhook (Hono server)
                              |
                              v
                   MessageProcessorService (orchestration)
                              |
                              |- TelegramService.sendChatAction (typing)
                              |- ClaudeService.createMessage
                              |- CostService.formatCostInfo
                              |- TelegramService.sendMessage
                              |
                              v
                         Effect.catchTags (error handling)
                              |
                              |- ConfigError -> 服务器配置错误
                              |- TelegramApiError -> 网络问题
                              |- ClaudeApiError -> AI 服务暂时不可用
                              |- catchAll -> 出现了错误
```

Key points:
- Hono server runs as a standard Node.js web server
- Webhook processes messages synchronously (waits for completion)
- Services injected via InversifyJS for testability
- Errors propagate to top layer for centralized handling
- Can be deployed to any Node.js hosting (Railway, Fly.io, VPS, etc.)
- No serverless timeout issues

### InversifyJS + Effect Service Pattern

Services are defined using InversifyJS decorators and Effect.fn for composable operations:

```typescript
import { injectable, inject } from 'inversify';
import { Effect } from 'effect';

export const MyService = Symbol.for('MyService');

@injectable()
export class MyServiceImpl {
  constructor(
    @inject(OtherService) private other: OtherServiceImpl
  ) {}

  // Use Effect.fn for automatic span creation and proper this binding
  doSomething = Effect.fn('MyService.doSomething')(function* (
    this: MyServiceImpl,
    param: string
  ) {
    // Add tracing attributes
    yield* Effect.annotateCurrentSpan('param', param);

    // Compose with other services
    const result = yield* this.other.someOperation();
    return result;
  });
}
```

Key patterns:
- Use `Effect.fn('ServiceName.methodName')` for all service methods
- Explicit `this: ClassName` parameter for proper type inference
- `Effect.annotateCurrentSpan` for adding tracing metadata
- Errors propagate upward - no catching in intermediate layers
- Only catch errors at top layer (Hono handler) using `Effect.catchTags`

### Effect Pattern Usage

The codebase uses Effect's generator-based approach for composing async operations:

```typescript
const program = Effect.gen(function* () {
  // Use yield* for Effect operations
  yield* Console.log("message");
  const result = yield* Effect.promise(() => asyncOperation());
  return result;
});

Effect.runPromise(program);
```

### Anthropic Bedrock SDK Integration

Uses the official Anthropic Bedrock SDK for AWS:

```typescript
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";

// Initialize client
const anthropic = new AnthropicBedrock({
  awsRegion: process.env.AWS_REGION,
  awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// Create message
const message = await anthropic.messages.create({
  model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  max_tokens: 8192,
  messages: [{ role: "user", content: "Hello, Claude" }],
});
```

Key features:
- Dedicated SDK for AWS Bedrock with built-in authentication
- Open-source SDK for better debugging and customization
- Standard Messages API with full control over parameters
- Direct access to token usage and response metadata
- No need for manual AWS request signing

### Error Handling

Custom errors are defined using `Data.TaggedError` for type-safe error handling:

```typescript
import { Data } from 'effect';

export class ConfigError extends Data.TaggedError('ConfigError')<{
  message: string;
  stack?: string;
}> {}

export class TelegramApiError extends Data.TaggedError('TelegramApiError')<{
  message: string;
  statusCode?: number;
  responseBody?: string;
  stack?: string;
}> {}
```

At the top level (Hono handler), use `Effect.catchTags` for fine-grained error handling:

```typescript
await Effect.runPromise(
  processor.processAndRespond(chatId, text).pipe(
    Effect.catchTags({
      ConfigError: (error) => Effect.gen(function* () {
        console.error('Configuration error:', error);
        yield* telegram.sendMessage(chatId, '服务器配置错误');
        return { success: false, error: 'ConfigError' };
      }),
      TelegramApiError: (error) => Effect.gen(function* () {
        console.error('Telegram API error:', error);
        yield* telegram.sendMessage(chatId, '网络问题');
        return { success: false, error: 'TelegramApiError' };
      }),
    }),
    Effect.catchAll((error: unknown) => {
      // Handle all other unknown errors
      console.error('Unknown error:', error);
      return Effect.succeed({ success: false, error: 'UnknownError' });
    })
  )
);
```

## Deployment

This is a standard Node.js web server that can be deployed anywhere:

### Railway
```bash
railway login
railway init
railway up
```

### Fly.io
```bash
fly launch
fly secrets set TELEGRAM_BOT_TOKEN=...
# Set other secrets
```

### Traditional VPS
```bash
npm run build
pm2 start npm --name "my-agent" -- start
```

### Local Testing with ngrok
```bash
ngrok http 3000
# Set Telegram webhook to ngrok URL
```

### Setting up Telegram Webhook

After deploying, set the webhook URL:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook"}'
```

## Important Notes

- The project uses Node.js native `--env-file` support, not the dotenv package
- All scripts use `--env-file=.env` flag to load environment variables
- Server defaults to port 3000 (configurable via `PORT` env var)
- Hono provides excellent performance and small bundle size
- The Anthropic SDK is open-source, allowing for better debugging and customization
