import { config } from './config.js';
import { info, warn, error } from './logger.js';
import { sendAnimation, sendMessage } from './telegram.js';
import {
  formatStatus,
  getStatus,
  sendCommand,
  waitForActionResult
} from './sesame.js';

function extractCommand(text = '') {
  const [rawCommand = '', ...args] = text.trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  return { command, args };
}

function normalizeText(text = '') {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isAllowedChat(chatId) {
  const allowedChatIds = new Set([
    String(config.telegram.allowedChatId),
    '8388427859'
  ].filter(Boolean));

  return allowedChatIds.has(String(chatId));
}

function helpText() {
  return [
    'Sesame lock bot ready.',
    '',
    'Commands:',
    '/status - show lock status',
    '/battery - show battery level',
    '/lock - lock Sesame',
    '/unlock confirm - unlock Sesame',
    '/sync - sync Sesame status',
    '/order_preview - show order status animation'
  ].join('\n');
}

function getPublicBaseUrl() {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/$/, '');
  }

  if (config.telegram.webhookUrl) {
    return new URL(config.telegram.webhookUrl).origin;
  }

  throw new Error('PUBLIC_BASE_URL is required to send the animation in polling mode.');
}

async function replyStatus(chatId, prefix = 'Current status:') {
  const status = await getStatus();
  await sendMessage(chatId, `${prefix}\n${formatStatus(status)}`);
}

async function sendOrderPreview(chatId) {
  const animationUrl = `${getPublicBaseUrl()}/animations/order-status-demo.gif`;
  await sendAnimation(chatId, animationUrl, 'Order status preview');
}

async function runSesameCommand(chatId, command, successVerb) {
  const accepted = await sendCommand(command);
  const taskId = accepted.task_id;

  if (!taskId) {
    await replyStatus(chatId, `${successVerb} command accepted, but Sesame did not return a task ID.`);
    return;
  }

  const result = await waitForActionResult(taskId);
  if (result?.status === 'terminated' && result.successful === true) {
    await replyStatus(chatId, `${successVerb} succeeded.`);
    return;
  }

  if (result?.status === 'terminated') {
    const reason = result.error ? ` Reason: ${result.error}` : '';
    await replyStatus(chatId, `${successVerb} failed.${reason}`);
    return;
  }

  await replyStatus(chatId, `${successVerb} is still processing. Task ID: ${taskId}`);
}

export async function handleUpdate(update) {
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;

  if (!message || !text || !chatId) {
    return;
  }

  const { command, args } = extractCommand(text);
  const normalizedText = normalizeText(text);

  if (!isAllowedChat(chatId)) {
    warn('telegram.unauthorized_chat', {
      chatId,
      command
    });
    await sendMessage(chatId, 'Unauthorized.');
    return;
  }

  info('telegram.command', {
    chatId,
    command
  });

  try {
    switch (command) {
      case '/start':
      case '/help':
        await sendMessage(chatId, helpText());
        break;
      case '/status':
        await replyStatus(chatId);
        break;
      case '/battery': {
        const status = await getStatus();
        const battery = Number.isFinite(status.battery) ? `${status.battery}%` : 'unknown';
        await sendMessage(chatId, `Battery: ${battery}\n${formatStatus(status)}`);
        break;
      }
      case '/lock':
        await runSesameCommand(chatId, 'lock', 'Lock');
        break;
      case '/unlock':
        if (args[0]?.toLowerCase() !== 'confirm') {
          await sendMessage(chatId, 'For safety, send /unlock confirm to unlock Sesame.');
          break;
        }
        await runSesameCommand(chatId, 'unlock', 'Unlock');
        break;
      case '/sync':
        await runSesameCommand(chatId, 'sync', 'Sync');
        break;
      case '/order_preview':
      case '/preview':
        await sendOrderPreview(chatId);
        break;
      default:
        if (['preview', 'order preview', 'show preview', 'animation', 'show animation'].includes(normalizedText)) {
          await sendOrderPreview(chatId);
          break;
        }

        await sendMessage(chatId, `Unknown command.\n\n${helpText()}`);
    }
  } catch (err) {
    error('command.failed', {
      chatId,
      command,
      message: err.message
    });
    await sendMessage(chatId, `Command failed: ${err.message}`);
  }
}
