# CLAUDE.md

## 重要

创建 github issue 只需要 diff，前后3行，不需要列出完成代码 

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript-based agent project using Effect for functional programming patterns and the Anthropic SDK for AI interactions via AWS Bedrock. The project includes a Telegram bot with a Hono web server for flexible deployment.

## Architecture

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

### Traditional VPS
```bash
./deploy.sh
```
### Setting up Telegram Webhook

After deploying, set the webhook URL:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook"}'
```

## Architecture Preferences and Refactoring Lessons

### Eliminate Code Duplication

**Bad**:
```typescript
// API call logic duplicated in two places
const result1 = yield* Effect.tryPromise({
  try: (signal) => client.messages.create(..., { signal }),
  catch: (e) => { /* error handling */ }
});

// Same logic repeated elsewhere
const result2 = yield* Effect.tryPromise({
  try: (signal) => client.messages.create(..., { signal }),
  catch: (e) => { /* error handling */ }
});
```

**Good**:
```typescript
// Extract unified method
private callApi = Effect.fn('ClaudeService.callApi')(function* (
  this: ClaudeServiceImpl,
  client: AnthropicBedrock,
  modelName: string,
  messages: MessageParam[],
  tools: unknown[]
) {
  const result = yield* Effect.tryPromise({ /* unified logic */ });
  yield* Effect.annotateCurrentSpan('stopReason', result.stop_reason);
  return result;
});

// Call from both locations
const result = yield* this.callApi(client, modelName, messages, tools);
```

**Key insight**: Extract common patterns early to maintain consistency.

### Clear Separation of Concerns

**Bad**:
```typescript
// Service layer handles both business logic AND user feedback
yield* this.doProcess(chatId, text).pipe(
  Effect.catchAll((error) => {
    // Service shouldn't directly handle UI feedback
    yield* this.telegram.sendMessage(chatId, 'Error occurred');
    return Effect.void;
  })
);
```

**Good**:
```typescript
// Service layer: Business logic only, errors propagate upward
yield* this.doProcess(chatId, text); // Let errors bubble up

// Server layer: Unified error handling with user feedback
Effect.catchTags({
  ConfigError: (error) => Effect.gen(function* () {
    yield* telegram.sendMessage(error.chatId, '服务器配置错误');
  }),
  InterruptedError: (error) => Effect.gen(function* () {
    yield* telegram.editMessage(error.chatId, error.statusMessageId, '❌ 操作已中断');
  })
})
```

**Key insight**: Service = business logic, Server = user interaction.

### Avoid Silent Failures

**Bad**:
```typescript
// Errors swallowed silently, no observability
yield* this.telegram.sendChatAction(chatId, 'typing').pipe(
  Effect.catchAll(() => Effect.void) // ❌ Silent failure
);
```

**Good**:
```typescript
// Log all failures for observability
yield* this.telegram.sendChatAction(chatId, 'typing').pipe(
  Effect.catchAll((e) => Console.error(`Failed to send typing action: ${e}`))
);
```

**Key insight**: Every failure should leave a trace for debugging.

### Strict Type Safety

**Rules**:
1. ❌ Never use `any` type
2. ✅ Use `unknown` for truly unknown types, then narrow with type guards
3. ✅ Use explicit type assertions (`as`) when needed, with comments explaining why
4. ✅ Define explicit types for external API responses

**Example**:
```typescript
// Bad
function handleData(data: any) { /* ... */ }

// Good
function handleData(data: unknown) {
  if (typeof data === 'object' && data !== null && 'id' in data) {
    const id = (data as { id: string }).id; // Type assertion with clear intent
    // ...
  }
}
```

### Use Effect Console in Effect.gen

**Bad**:
```typescript
Effect.gen(function* () {
  console.log('Starting process'); // ❌ Regular console
  // ...
});
```

**Good**:
```typescript
Effect.gen(function* () {
  yield* Console.log('Starting process'); // ✅ Effect Console
  // ...
});
```

**Benefits**:
- Better integration with OpenTelemetry tracing
- Testable (can be mocked in tests)
- Composable with other Effects

### Imperative vs Functional Style

Sometimes imperative code is clearer than functional composition:

**Functional (harder to read)**:
```typescript
yield* Fiber.join(fiber).pipe(
  Effect.ensuring(Effect.sync(() => this.activeFibers.delete(messageId))),
  Effect.catchAllCause((cause) => {
    if (Cause.isInterruptedOnly(cause)) {
      return this.handleInterruptedCause(chatId, statusMessageId, messageId);
    }
    return Effect.failCause(cause);
  })
);
```

**Imperative (clearer)**:
```typescript
const exitResult = yield* Fiber.await(fiber);
this.activeFibers.delete(messageId);

if (Exit.isFailure(exitResult) && Cause.isInterruptedOnly(exitResult.cause)) {
  yield* Console.log(`⚠️  Request interrupted: ${messageId}`);
  return yield* Effect.fail(new InterruptedError({ /* ... */ }));
}

if (Exit.isFailure(exitResult)) {
  return yield* Effect.failCause(exitResult.cause);
}
```

**Key insight**: Use the style that best communicates intent. Generator functions already provide imperative sequencing.
