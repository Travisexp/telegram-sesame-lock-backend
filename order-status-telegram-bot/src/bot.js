import { config } from './config.js';
import { info, warn, error } from './logger.js';
import { getOrder, setOrderStatus } from './store.js';
import { normalizeStatus, statusChoices, STATUSES } from './statuses.js';
import { sendAnimation, sendMessage } from './telegram.js';

function extractCommand(text = '') {
  const [rawCommand = '', ...args] = text.trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  return { command, args };
}

function isAllowedChat(chatId) {
  return String(chatId) === String(config.telegram.allowedChatId);
}

function helpText() {
  return [
    'Stock status bot ready.',
    '',
    'Commands:',
    '/preview pending_approval',
    '/preview approved',
    '/preview merchant_received',
    '/preview delivery',
    '/setstatus ITEM_ID pending_approval',
    '/setstatus ITEM_ID approved',
    '/setstatus ITEM_ID merchant_received',
    '/setstatus ITEM_ID delivery',
    '/item ITEM_ID'
  ].join('\n');
}

function getPublicBaseUrl() {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/$/, '');
  }

  if (config.telegram.webhookUrl) {
    return new URL(config.telegram.webhookUrl).origin;
  }

  throw new Error('PUBLIC_BASE_URL is required to send hosted animations.');
}

export async function sendStatusAnimation(chatId, status, orderId = '') {
  const statusMeta = STATUSES[status];
  if (!statusMeta) {
    throw new Error(`Unknown status. Use one of: ${statusChoices()}`);
  }

  const animationUrl = `${getPublicBaseUrl()}/animations/${statusMeta.file}`;
  const caption = orderId
    ? `Item ${orderId}: ${statusMeta.label}`
    : statusMeta.label;

  await sendAnimation(chatId, animationUrl, caption);
}

export async function handleUpdate(update) {
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;

  if (!message || !text || !chatId) {
    return;
  }

  const { command, args } = extractCommand(text);

  if (!isAllowedChat(chatId)) {
    warn('telegram.unauthorized_chat', { chatId, command });
    await sendMessage(chatId, 'Unauthorized.');
    return;
  }

  info('telegram.command', { chatId, command });

  try {
    switch (command) {
      case '/start':
      case '/help':
        await sendMessage(chatId, helpText());
        break;

      case '/preview': {
        const status = normalizeStatus(args[0] || 'pending');
        if (!status) {
          await sendMessage(chatId, `Unknown status. Use one of: ${statusChoices()}`);
          break;
        }
        await sendStatusAnimation(chatId, status);
        break;
      }

      case '/setstatus': {
        const orderId = args[0];
        const status = normalizeStatus(args[1] || '');

        if (!orderId || !status) {
          await sendMessage(chatId, `Usage: /setstatus ORDER_ID STATUS\nStatuses: ${statusChoices()}`);
          break;
        }

        setOrderStatus(orderId, status);
        await sendStatusAnimation(chatId, status, orderId);
        break;
      }

      case '/item':
      case '/order': {
        const orderId = args[0];
        if (!orderId) {
          await sendMessage(chatId, 'Usage: /item ITEM_ID');
          break;
        }

        const order = getOrder(orderId);
        if (!order) {
          await sendMessage(chatId, `No status found for item ${orderId}.`);
          break;
        }

        await sendStatusAnimation(chatId, order.status, orderId);
        break;
      }

      default:
        await sendMessage(chatId, `Unknown command.\n\n${helpText()}`);
    }
  } catch (err) {
    error('command.failed', { chatId, command, message: err.message });
    await sendMessage(chatId, `Command failed: ${err.message}`);
  }
}
