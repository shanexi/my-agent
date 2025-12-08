# my-agent

A TypeScript-based AI agent powered by Claude via AWS Bedrock, with Telegram bot integration.

## Features

- 🤖 Claude Agent SDK integration via AWS Bedrock
- 💬 Telegram bot with webhook support
- 🌐 Hono web server for flexible deployment
- 🔧 TypeScript with Effect for functional programming
- 🚀 Deploy anywhere (Railway, Fly.io, VPS, etc.)

## Quick Start

### Prerequisites

- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- AWS Bedrock access with Claude model enabled

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

   Server will start on http://localhost:3000

5. Test the server:
   ```bash
   curl http://localhost:3000/
   ```

### Setting up Telegram Webhook

Set your webhook to point to your server:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook"}'
```

For local testing with ngrok:

```bash
ngrok http 3000
# Then set webhook to: https://your-ngrok-url.ngrok.io/webhook
```

## Deployment

### Railway

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Deploy:
   ```bash
   railway login
   railway init
   railway up
   ```

3. Set environment variables in Railway dashboard

### Fly.io

1. Install flyctl:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Deploy:
   ```bash
   fly launch
   fly secrets set TELEGRAM_BOT_TOKEN=your-token
   fly secrets set CLAUDE_CODE_USE_BEDROCK=1
   fly secrets set ANTHROPIC_MODEL=your-model-id
   fly secrets set AWS_ACCESS_KEY_ID=your-key
   fly secrets set AWS_SECRET_ACCESS_KEY=your-secret
   fly secrets set AWS_REGION=us-west-2
   ```

### Traditional VPS

1. Build the project:
   ```bash
   npm run build
   ```

2. Run with PM2:
   ```bash
   npm install -g pm2
   pm2 start npm --name "my-agent" -- start
   pm2 save
   pm2 startup
   ```

## Project Structure

```
├── src/
│   └── server.ts           # Hono web server (main entry)
├── .env                    # Environment configuration
├── package.json            # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Yes |
| `CLAUDE_CODE_USE_BEDROCK` | Enable AWS Bedrock (set to `1`) | Yes |
| `ANTHROPIC_MODEL` | Bedrock model ID | Yes |
| `AWS_ACCESS_KEY_ID` | AWS credentials | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | Yes |
| `AWS_REGION` | AWS region (e.g., `us-west-2`) | Yes |
| `PORT` | Server port (default: `3000`) | No |

## Development

```bash
# Run development server with hot reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run compiled code
npm run start
```

## API Endpoints

- `GET /` - Health check
- `POST /webhook` - Telegram webhook endpoint

## License

ISC
