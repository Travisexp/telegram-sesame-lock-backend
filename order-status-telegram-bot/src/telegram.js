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
      { command: 'start', description: 'Show help' },
      { command: 'help', description: 'Show help' },
      { command: 'myid', description: 'Show your Telegram chat ID' },
      { command: 'request', description: 'Request stock approval' },
      { command: 'addstaff', description: 'Add staff chat ID' },
      { command: 'approve', description: 'Approve item request' },
      { command: 'reject', description: 'Reject item request' },
      { command: 'preview', description: 'Preview a status animation' },
      { command: 'setstatus', description: 'Set item status' },
      { command: 'item', description: 'Show item status' }
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
