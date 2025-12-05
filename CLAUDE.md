# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript-based agent project using Effect for functional programming patterns and the Claude Agent SDK for AI interactions. The project includes a Telegram bot that uses webhook-based serverless deployment on Vercel.

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

This project requires a `.env` file for AWS Bedrock and Telegram configuration. Environment variables are loaded using Node.js native `--env-file` flag (no dotenv package needed).

Required environment variables:
- `CLAUDE_CODE_USE_BEDROCK=1` - Enable AWS Bedrock
- `ANTHROPIC_MODEL` - The Bedrock model ID (e.g., `us.anthropic.claude-sonnet-4-5-20250929-v1:0`)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token from @BotFather

Copy `.env.example` to `.env` and configure as needed.

For Vercel deployment, set environment variables in the Vercel dashboard.

## Architecture

### Technology Stack
- **TypeScript** with ES2022 target and Node16 module resolution
- **Effect** - Functional effect system for type-safe async operations
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) - Uses `unstable_v2_prompt` API for Claude interactions
- **AWS Bedrock** - Claude API access via AWS infrastructure
- **Telegraf** - Telegram bot framework
- **Vercel** - Serverless deployment platform

### Code Structure
- `src/index.ts` - Main entry point demonstrating Effect-based agent program
- `src/telegram.ts` - Telegram API utilities (sendMessage, sendChatAction)
- `src/agent.ts` - Claude Agent SDK wrapper
- `api/webhook.ts` - Vercel serverless function for Telegram webhook
- All TypeScript code compiles to `dist/` directory

### Telegram Bot Architecture

**Webhook Pattern (Serverless-friendly)**:
```
User message -> Telegram -> POST /api/webhook
                              |
                              |- Return 200 OK immediately
                              |
                              |- Async: Send typing indicator
                              |- Async: Call Claude Agent
                              |- Async: Send response via Telegram API
```

This approach avoids serverless timeout issues by:
1. Responding to webhook immediately (< 1s)
2. Processing message asynchronously in background
3. Sending response directly via Telegram API (not webhook response)

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

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel

# Set environment variables
vercel env add TELEGRAM_BOT_TOKEN
vercel env add CLAUDE_CODE_USE_BEDROCK
vercel env add ANTHROPIC_MODEL
vercel env add AWS_REGION
vercel env add AWS_ACCESS_KEY_ID
vercel env add AWS_SECRET_ACCESS_KEY
```

### Setting up Telegram Webhook

After deploying to Vercel, set the webhook URL:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-vercel-domain.vercel.app/api/webhook"}'
```

## Important Notes

- The project uses Node.js native `--env-file` support, not the dotenv package (dotenv is installed but unused)
- Zod version conflict exists between project (v4) and SDK requirement (v3.24.1) - currently using `--legacy-peer-deps` workaround
- All scripts must use `--env-file=.env` flag to load environment variables
- Vercel functions have 60s timeout on Pro plan, 10s on Hobby plan
- Async processing allows Claude API calls to take longer without webhook timeout
