# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript-based agent project using Effect for functional programming patterns and the Claude Agent SDK for AI interactions. The project includes a Telegram bot with a Hono web server for flexible deployment.

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
- `CLAUDE_CODE_USE_BEDROCK=1` - Enable AWS Bedrock
- `ANTHROPIC_MODEL` - The Bedrock model ID (e.g., `us.anthropic.claude-sonnet-4-5-20250929-v1:0`)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token from @BotFather
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - AWS credentials

Copy `.env.example` to `.env` and configure as needed.

## Architecture

### Technology Stack
- **TypeScript** with ES2022 target and Node16 module resolution
- **Effect** - Functional effect system for type-safe async operations
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) - Uses `unstable_v2_prompt` API for Claude interactions
- **AWS Bedrock** - Claude API access via AWS infrastructure
- **Hono** - Fast, lightweight web framework
- **@hono/node-server** - Node.js adapter for Hono

### Code Structure
- `src/server.ts` - Hono web server with webhook endpoint (main entry point)
  - All Telegram and Claude Agent logic is self-contained in this file
- All TypeScript code compiles to `dist/` directory

### Telegram Bot Architecture

**Webhook Pattern with Hono:**
```
User message -> Telegram -> POST /webhook (Hono server)
                              |
                              |- Send typing indicator
                              |- Call Claude Agent
                              |- Send response via Telegram API
                              |- Return 200 OK
```

Key points:
- Hono server runs as a standard Node.js web server
- Webhook processes messages synchronously (waits for completion)
- Can be deployed to any Node.js hosting (Railway, Fly.io, VPS, etc.)
- No serverless timeout issues

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

### Claude Agent SDK Integration

Uses the V2 unstable API:
- `unstable_v2_prompt(message, options)` - One-shot prompt function
- Model configuration via `options.model` (reads from `ANTHROPIC_MODEL` env var)
- Returns `SDKResultMessage` with response text, usage stats, and session info

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
- Zod version conflict exists between project (v4) and SDK requirement (v3.24.1) - using `--legacy-peer-deps` workaround
- All scripts use `--env-file=.env` flag to load environment variables
- Server defaults to port 3000 (configurable via `PORT` env var)
- Hono provides excellent performance and small bundle size
