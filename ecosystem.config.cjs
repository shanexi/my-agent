// PM2 Configuration
module.exports = {
  apps: [{
    name: 'my-agent',
    script: 'dist/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,

      // AWS Bedrock Configuration
      CLAUDE_CODE_USE_BEDROCK: '1',
      ANTHROPIC_MODEL: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',

      // AWS Credentials - SET THESE BEFORE DEPLOYING
      AWS_REGION: 'us-west-2',
      AWS_ACCESS_KEY_ID: 'YOUR_AWS_ACCESS_KEY_ID',
      AWS_SECRET_ACCESS_KEY: 'YOUR_AWS_SECRET_ACCESS_KEY',

      // Telegram Bot - SET THIS BEFORE DEPLOYING
      TELEGRAM_BOT_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN',
    },
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }]
};
