# my-agent

A TypeScript-based AI agent powered by Claude via AWS Bedrock, with Telegram bot integration deployed on Vercel.

## Features

- 🤖 Claude Agent SDK integration via AWS Bedrock
- 💬 Telegram bot with webhook support
- ⚡ Serverless deployment on Vercel
- 🔧 TypeScript with Effect for functional programming
- 🚀 Asynchronous message processing (no timeout issues)

## Quick Start

### Prerequisites

- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- AWS Bedrock access with Claude model enabled
- Vercel account (for deployment)

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. Run locally:
   ```bash
   npm run dev
   ```

### Deployment to Vercel

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Set environment variables in Vercel dashboard:
   - `TELEGRAM_BOT_TOKEN`
   - `CLAUDE_CODE_USE_BEDROCK=1`
   - `ANTHROPIC_MODEL`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`

4. Set Telegram webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-vercel-domain.vercel.app/api/webhook"}'
   ```

## How It Works

The bot uses a serverless-friendly webhook pattern:

1. User sends message to Telegram bot
2. Telegram POSTs to `/api/webhook`
3. Function returns 200 OK immediately
4. Message is processed asynchronously:
   - Send typing indicator
   - Call Claude Agent SDK
   - Send response via Telegram API

This avoids serverless timeout issues while providing real-time responses.

## Project Structure

```
├── api/
│   └── webhook.ts          # Vercel serverless function
├── src/
│   ├── index.ts            # CLI demo
│   ├── agent.ts            # Claude Agent wrapper
│   └── telegram.ts         # Telegram API utilities
├── vercel.json             # Vercel configuration
├── tsconfig.json           # TypeScript configuration
└── CLAUDE.md               # Development guide
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Yes |
| `CLAUDE_CODE_USE_BEDROCK` | Enable AWS Bedrock (set to `1`) | Yes |
| `ANTHROPIC_MODEL` | Bedrock model ID | Yes |
| `AWS_ACCESS_KEY_ID` | AWS credentials | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | Yes |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) | No |

## License

ISC
