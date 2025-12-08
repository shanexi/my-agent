#!/bin/bash

# Deployment script for my-agent to VPS
# Usage: ./deploy.sh [VPS_HOST]

set -e

# Configuration
VPS_HOST="${1:-ubuntu@100.97.88.24}"
APP_DIR="~/my-agent"
APP_NAME="my-agent"

echo "🚀 Deploying to $VPS_HOST..."

# Step 1: Build locally
echo "📦 Building application..."
npm run build

# Step 2: Upload production files only
echo "📤 Uploading production files to VPS..."
ssh "$VPS_HOST" "mkdir -p $APP_DIR/dist"

rsync -avz --delete \
  dist/ \
  "$VPS_HOST:$APP_DIR/dist/"

rsync -avz \
  package.json \
  package-lock.json \
  ecosystem.config.cjs \
  "$VPS_HOST:$APP_DIR/"

echo "✅ Files uploaded"

# Step 3: Install dependencies and setup PM2
echo "📥 Installing dependencies on VPS..."
ssh "$VPS_HOST" bash << 'ENDSSH'
cd ~/my-agent

# Create logs directory
mkdir -p logs

# Install only production dependencies
echo "  Installing npm packages..."
npm install --legacy-peer-deps --production

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
  echo "  Installing PM2..."
  sudo npm install -g pm2
fi

# Validate ecosystem.config.cjs
echo ""
echo "⚠️  IMPORTANT: Check your environment variables in ecosystem.config.cjs"
echo ""
if grep -q "YOUR_" ecosystem.config.cjs; then
  echo "❌ ERROR: Environment variables not configured!"
  echo ""
  echo "Please edit ecosystem.config.cjs and set:"
  echo "  - AWS_ACCESS_KEY_ID"
  echo "  - AWS_SECRET_ACCESS_KEY"
  echo "  - TELEGRAM_BOT_TOKEN"
  echo ""
  echo "Run: ssh ubuntu@100.97.88.24 'nano ~/my-agent/ecosystem.config.cjs'"
  exit 1
fi

# Stop existing process if running
echo "  Stopping existing PM2 process (if any)..."
pm2 stop my-agent 2>/dev/null || true
pm2 delete my-agent 2>/dev/null || true

# Start the application
echo "  Starting application with PM2..."
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
if ! pm2 list | grep -q startup; then
  echo "  Setting up PM2 startup..."
  sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
  pm2 save
fi

# Show status
echo ""
echo "✅ Application deployed and running!"
echo ""
pm2 list
echo ""
echo "📋 Recent logs:"
pm2 logs my-agent --lines 15 --nostream
ENDSSH

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Useful commands:"
echo "  ssh $VPS_HOST 'pm2 status'           # Check status"
echo "  ssh $VPS_HOST 'pm2 logs my-agent'    # View logs"
echo "  ssh $VPS_HOST 'pm2 restart my-agent' # Restart app"
echo "  ssh $VPS_HOST 'pm2 stop my-agent'    # Stop app"
echo ""
echo "Next steps:"
echo "  1. Configure Nginx to proxy port 3000"
echo "  2. Set Telegram webhook:"
echo "     curl -X POST \"https://api.telegram.org/bot<TOKEN>/setWebhook\" \\"
echo "       -H \"Content-Type: application/json\" \\"
echo "       -d '{\"url\": \"https://your-domain.com/webhook\"}'"
