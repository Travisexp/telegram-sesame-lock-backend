import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideOrderFromEmail, handleUpdate, sendStatusAnimation } from './bot.js';
import { config } from './config.js';
import { getEmailDecision } from './email.js';
import { error, info, warn } from './logger.js';
import { setOrderStatus } from './store.js';
import { normalizeStatus, statusChoices } from './statuses.js';
import { deleteWebhook, getUpdates, setBotCommands, setWebhook } from './telegram.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/animations', express.static(path.join(publicDir, 'animations')));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'stock-status-telegram-bot',
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

app.get('/email/decision', (req, res) => {
  const { orderId, action, token } = req.query;
  if (typeof orderId !== 'string' || typeof action !== 'string' || typeof token !== 'string' ||
      !/^\d+$/.test(orderId) || !/^[a-f0-9]{64}$/.test(token) ||
      !getEmailDecision(orderId, action, token)) {
    res.status(404).send('This approval link is invalid or expired.');
    return;
  }

  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.send(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${orderId}</title><body style="font:16px system-ui;max-width:28rem;margin:3rem auto;padding:1rem"><h1>Invoice ${orderId}</h1><p>Confirm ${action === 'approve' ? 'approval' : 'rejection'}?</p><form method="post" action="/email/decision"><input type="hidden" name="orderId" value="${orderId}"><input type="hidden" name="action" value="${action}"><input type="hidden" name="token" value="${token}"><button type="submit">Confirm ${action === 'approve' ? 'Approve' : 'Reject'}</button></form></body></html>`);
});

app.post('/email/decision', async (req, res) => {
  const { orderId, action, token } = req.body;
  if (typeof orderId !== 'string' || typeof action !== 'string' || typeof token !== 'string' ||
      !/^\d+$/.test(orderId) || !/^[a-f0-9]{64}$/.test(token) ||
      !getEmailDecision(orderId, action, token)) {
    res.status(404).send('This approval link is invalid or expired.');
    return;
  }

  const decided = await decideOrderFromEmail(orderId, action, token);
  res.set('Cache-Control', 'no-store');
  res.send(decided ? `Invoice ${orderId} ${action === 'approve' ? 'approved' : 'rejected'}. Staff has been notified in Telegram.` : 'This invoice was already decided.');
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
