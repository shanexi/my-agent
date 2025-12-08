# Deployment Guide

## Prerequisites

- VPS with Ubuntu (Node.js v18+ already installed)
- SSH access to VPS
- Domain with SSL (for Telegram webhook)

## Quick Deploy

### 1. Configure Environment Variables

Edit `ecosystem.config.cjs` and set your credentials:

```javascript
env: {
  // AWS Credentials
  AWS_REGION: 'us-west-2',
  AWS_ACCESS_KEY_ID: 'YOUR_KEY',
  AWS_SECRET_ACCESS_KEY: 'YOUR_SECRET',

  // Telegram Bot Token
  TELEGRAM_BOT_TOKEN: 'YOUR_TOKEN',

  // Model (already configured)
  ANTHROPIC_MODEL: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
}
```

### 2. Deploy

```bash
./deploy.sh ubuntu@100.97.88.24
```

The script will:
- ✅ Build the application locally
- ✅ Upload only production files (dist/, package.json, ecosystem.config.cjs)
- ✅ Install dependencies on VPS
- ✅ Install and configure PM2
- ✅ Start the application
- ✅ Setup auto-restart on boot

### 3. Configure Nginx

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. Setup Telegram Webhook

After Nginx is configured with SSL:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook"}'
```

Verify webhook:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

## PM2 Commands

```bash
# On VPS
ssh ubuntu@100.97.88.24

# Check status
pm2 status

# View logs
pm2 logs my-agent

# Restart application
pm2 restart my-agent

# Stop application
pm2 stop my-agent

# Monitor
pm2 monit
```

## Updates

To deploy updates:

```bash
# Make your changes
# Then deploy
./deploy.sh
```

PM2 will automatically restart with zero downtime.

## Troubleshooting

### Check if app is running
```bash
ssh ubuntu@100.97.88.24 'pm2 status'
```

### View recent logs
```bash
ssh ubuntu@100.97.88.24 'pm2 logs my-agent --lines 50'
```

### Restart app
```bash
ssh ubuntu@100.97.88.24 'pm2 restart my-agent'
```

### Check environment variables
```bash
ssh ubuntu@100.97.88.24 'pm2 env my-agent'
```

### Test webhook locally
```bash
curl http://localhost:3000/
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"update_id": 1, "message": {"message_id": 1, "chat": {"id": 123, "type": "private"}, "text": "test", "date": 123456}}'
```
