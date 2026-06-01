import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleUpdate, sendStatusAnimation } from './bot.js';
import { config } from './config.js';
import { error, info, warn } from './logger.js';
import { setOrderStatus } from './store.js';
import { normalizeStatus, statusChoices } from './statuses.js';
import { deleteWebhook, getUpdates, setBotCommands, setWebhook } from './telegram.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

app.use(express.json());
app.use('/animations', express.static(path.join(publicDir, 'animations')));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'order-status-telegram-bot',
    mode: config.botMode,
    time: new Date().toISOString()
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mode: config.botMode,
    time: new Date().toISOString()
  });
});

app.post('/telegram/webhook', (req, res) => {
  if (config.telegram.webhookSecret) {
    const receivedSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
    if (receivedSecret !== config.telegram.webhookSecret) {
      warn('telegram.webhook_bad_secret');
      res.sendStatus(401);
      return;
    }
  }

  res.sendStatus(200);
  handleUpdate(req.body).catch((err) => {
    error('telegram.webhook_update_failed', { message: err.message });
  });
});

app.post('/orders/:orderId/status', async (req, res) => {
  if (config.orderWebhookApiKey) {
    const receivedApiKey = req.get('X-API-Key');
    if (receivedApiKey !== config.orderWebhookApiKey) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
  }

  const orderId = req.params.orderId;
  const status = normalizeStatus(req.body?.status || '');
  const chatId = req.body?.chatId || config.telegram.allowedChatId;

  if (!status) {
    res.status(400).json({
      ok: false,
      error: `Invalid status. Use one of: ${statusChoices()}`
    });
    return;
  }

  const order = setOrderStatus(orderId, status);
  await sendStatusAnimation(chatId, status, orderId);
  res.json({ ok: true, order });
});

async function startPolling() {
  if (config.telegram.clearWebhookOnPoll) {
    await deleteWebhook(false);
    info('telegram.webhook_deleted_for_polling');
  }

  let offset;
  info('telegram.polling_started');

  while (true) {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (err) {
      error('telegram.polling_error', { message: err.message });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function start() {
  app.listen(config.port, () => {
    info('server.started', {
      port: config.port,
      mode: config.botMode
    });
  });

  try {
    await setBotCommands();
    info('telegram.commands_set');
  } catch (err) {
    error('telegram.commands_set_failed', { message: err.message });
  }

  if (config.botMode === 'webhook') {
    try {
      await setWebhook();
      info('telegram.webhook_set', {
        webhookUrl: config.telegram.webhookUrl
      });
    } catch (err) {
      error('telegram.webhook_set_failed', { message: err.message });
    }
    return;
  }

  await startPolling();
}

start().catch((err) => {
  error('server.start_failed', { message: err.message });
  process.exitCode = 1;
});
