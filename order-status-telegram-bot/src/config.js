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

function readListEnv(name) {
  return readEnv(name)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const botMode = readEnv('BOT_MODE', { defaultValue: 'polling' }).toLowerCase();

export const config = {
  port: readIntEnv('PORT', 3000),
  nodeEnv: readEnv('NODE_ENV', { defaultValue: 'development' }),
  botMode,
  publicBaseUrl: readEnv('PUBLIC_BASE_URL'),
  orderWebhookApiKey: readEnv('ORDER_WEBHOOK_API_KEY'),
  telegram: {
    botToken: readEnv('TELEGRAM_BOT_TOKEN', { required: true }),
    allowedChatId: readEnv('TELEGRAM_ALLOWED_CHAT_ID', { required: true }),
    ownerChatId: readEnv('TELEGRAM_OWNER_CHAT_ID', {
      defaultValue: readEnv('TELEGRAM_ALLOWED_CHAT_ID', { required: true })
    }),
    staffChatIds: readListEnv('TELEGRAM_STAFF_CHAT_IDS'),
    webhookUrl: readEnv('WEBHOOK_URL'),
    webhookSecret: readEnv('TELEGRAM_WEBHOOK_SECRET'),
    clearWebhookOnPoll: readEnv('TELEGRAM_CLEAR_WEBHOOK_ON_POLL', {
      defaultValue: 'true'
    }).toLowerCase() === 'true'
  }
};

if (!['polling', 'webhook'].includes(config.botMode)) {
  throw new Error('BOT_MODE must be either polling or webhook');
}

if (config.botMode === 'webhook' && !config.telegram.webhookUrl) {
  throw new Error('WEBHOOK_URL is required when BOT_MODE=webhook');
}
