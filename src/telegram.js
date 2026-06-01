import { config } from './config.js';

const telegramApiBase = `https://api.telegram.org/bot${config.telegram.botToken}`;

async function telegramRequest(method, payload = {}) {
  const response = await fetch(`${telegramApiBase}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const description = body.description || `Telegram HTTP ${response.status}`;
    throw new Error(description);
  }

  return body.result;
}

export async function sendMessage(chatId, text) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

export async function sendAnimation(chatId, animation, caption) {
  return telegramRequest('sendAnimation', {
    chat_id: chatId,
    animation,
    caption
  });
}

export async function setBotCommands() {
  return telegramRequest('setMyCommands', {
    commands: [
      { command: 'start', description: 'Show bot commands' },
      { command: 'help', description: 'Show bot commands' },
      { command: 'status', description: 'Show lock status' },
      { command: 'battery', description: 'Show battery level' },
      { command: 'lock', description: 'Lock Sesame' },
      { command: 'unlock', description: 'Unlock Sesame with confirm' },
      { command: 'sync', description: 'Sync Sesame status' },
      { command: 'preview', description: 'Show order status animation' },
      { command: 'order_preview', description: 'Show order status animation' }
    ]
  });
}

export async function getUpdates(offset) {
  const params = {
    timeout: 25,
    allowed_updates: ['message']
  };

  if (offset) {
    params.offset = offset;
  }

  return telegramRequest('getUpdates', params);
}

export async function setWebhook() {
  return telegramRequest('setWebhook', {
    url: config.telegram.webhookUrl,
    allowed_updates: ['message'],
    secret_token: config.telegram.webhookSecret || undefined
  });
}

export async function deleteWebhook(dropPendingUpdates = false) {
  return telegramRequest('deleteWebhook', {
    drop_pending_updates: dropPendingUpdates
  });
}
