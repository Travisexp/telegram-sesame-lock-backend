import dotenv from 'dotenv';

dotenv.config();

function readEnv(name, options = {}) {
  const value = process.env[name];
  if (options.required && (!value || value.trim() === '')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value?.trim() ?? options.defaultValue ?? '';
}

function readIntEnv(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return parsed;
}

const botMode = readEnv('BOT_MODE', { defaultValue: 'polling' }).toLowerCase();

export const config = {
  port: readIntEnv('PORT', 3000),
  nodeEnv: readEnv('NODE_ENV', { defaultValue: 'development' }),
  botMode,
  publicBaseUrl: readEnv('PUBLIC_BASE_URL'),
  telegram: {
    botToken: readEnv('TELEGRAM_BOT_TOKEN', { required: true }),
    allowedChatId: readEnv('TELEGRAM_ALLOWED_CHAT_ID', { required: true }),
    webhookUrl: readEnv('WEBHOOK_URL'),
    webhookSecret: readEnv('TELEGRAM_WEBHOOK_SECRET'),
    clearWebhookOnPoll: readEnv('TELEGRAM_CLEAR_WEBHOOK_ON_POLL', {
      defaultValue: 'true'
    }).toLowerCase() === 'true'
  },
  sesame: {
    apiBaseUrl: readEnv('SESAME_API_BASE_URL', {
      defaultValue: 'https://api.candyhouse.co/public'
    }).replace(/\/$/, ''),
    apiKey: readEnv('SESAME_API_KEY', { required: true }),
    deviceUuid: readEnv('SESAME_DEVICE_UUID', { required: true }),
    secretKey: readEnv('SESAME_SECRET_KEY'),
    resultAttempts: readIntEnv('SESAME_RESULT_ATTEMPTS', 8),
    resultDelayMs: readIntEnv('SESAME_RESULT_DELAY_MS', 1200)
  },
  commandLogEnabled: readEnv('COMMAND_LOG_ENABLED', {
    defaultValue: 'true'
  }).toLowerCase() === 'true'
};

if (!['polling', 'webhook'].includes(config.botMode)) {
  throw new Error('BOT_MODE must be either polling or webhook');
}

if (config.botMode === 'webhook' && !config.telegram.webhookUrl) {
  throw new Error('WEBHOOK_URL is required when BOT_MODE=webhook');
}
