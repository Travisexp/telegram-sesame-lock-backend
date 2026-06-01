import { config } from './config.js';
import { info, warn, error } from './logger.js';
import { createOrderRequest, getOrder, setOrderStatus } from './store.js';
import { normalizeStatus, statusChoices, STATUSES } from './statuses.js';
import { sendAnimation, sendMessage } from './telegram.js';

const staffChatIds = new Set(config.telegram.staffChatIds.map(String));

function extractCommand(text = '') {
  const [rawCommand = '', ...args] = text.trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  return { command, args };
}

function isAllowedChat(chatId) {
  return isOwnerChat(chatId) || isStaffChat(chatId);
}

function isOwnerChat(chatId) {
  return String(chatId) === String(config.telegram.ownerChatId);
}

function isStaffChat(chatId) {
  return staffChatIds.has(String(chatId));
}

function requesterName(message) {
  const user = message.from;
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Staff';
}

function helpText(chatId) {
  const sharedCommands = [
    'Stock status bot ready.',
    '',
    'Staff:',
    '/request ITEM_NAME',
    '/item ITEM_ID'
  ];

  if (!isOwnerChat(chatId)) {
    return sharedCommands.join('\n');
  }

  return [
    ...sharedCommands,
    '',
    'Owner:',
    '/addstaff CHAT_ID',
    '/approve ITEM_ID',
    '/reject ITEM_ID',
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
  const order = orderId ? getOrder(orderId) : null;
  const caption = order
    ? `Item ${orderId}: ${order.itemName || 'Stock item'}\nStatus: ${statusMeta.label}`
    : orderId
      ? `Item ${orderId}: ${statusMeta.label}`
      : statusMeta.label;

  await sendAnimation(chatId, animationUrl, caption);
}

async function notifyOrderStatus(order, status) {
  await sendStatusAnimation(config.telegram.ownerChatId, status, order.orderId);

  if (order.requesterChatId && String(order.requesterChatId) !== String(config.telegram.ownerChatId)) {
    await sendStatusAnimation(order.requesterChatId, status, order.orderId);
  }
}

export async function handleUpdate(update) {
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;

  if (!message || !text || !chatId) {
    return;
  }

  const { command, args } = extractCommand(text);

  if (command === '/myid') {
    await sendMessage(chatId, `Your Telegram chat ID is:\n${chatId}`);
    return;
  }

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
        await sendMessage(chatId, helpText(chatId));
        break;

      case '/addstaff': {
        if (!isOwnerChat(chatId)) {
          await sendMessage(chatId, 'Only the owner can add staff.');
          break;
        }

        const staffChatId = args[0];
        if (!staffChatId) {
          await sendMessage(chatId, 'Usage: /addstaff CHAT_ID');
          break;
        }

        staffChatIds.add(String(staffChatId));
        await sendMessage(chatId, `Staff added for this running session: ${staffChatId}`);
        await sendMessage(staffChatId, 'You can now request stock approval with /request ITEM_NAME.').catch(() => {});
        break;
      }

      case '/request': {
        const itemName = args.join(' ').trim();
        if (!itemName) {
          await sendMessage(chatId, 'Usage: /request ITEM_NAME');
          break;
        }

        const order = createOrderRequest({
          itemName,
          requesterChatId: chatId,
          requesterName: requesterName(message)
        });

        await sendMessage(chatId, `Request sent for approval.\nItem ${order.orderId}: ${order.itemName}`);
        await sendMessage(
          config.telegram.ownerChatId,
          [
            'New stock request',
            `Item ${order.orderId}: ${order.itemName}`,
            `From: ${order.requesterName}`,
            '',
            `Approve: /approve ${order.orderId}`,
            `Reject: /reject ${order.orderId}`
          ].join('\n')
        );
        await sendStatusAnimation(config.telegram.ownerChatId, 'pending_approval', order.orderId);
        break;
      }

      case '/approve': {
        if (!isOwnerChat(chatId)) {
          await sendMessage(chatId, 'Only the owner can approve stock requests.');
          break;
        }

        const orderId = args[0];
        const order = getOrder(orderId);
        if (!order) {
          await sendMessage(chatId, `No status found for item ${orderId}.`);
          break;
        }

        const updated = setOrderStatus(orderId, 'approved', { approvedBy: String(chatId) });
        await notifyOrderStatus(updated, 'approved');
        break;
      }

      case '/reject': {
        if (!isOwnerChat(chatId)) {
          await sendMessage(chatId, 'Only the owner can reject stock requests.');
          break;
        }

        const orderId = args[0];
        const order = getOrder(orderId);
        if (!order) {
          await sendMessage(chatId, `No status found for item ${orderId}.`);
          break;
        }

        const updated = setOrderStatus(orderId, 'rejected', { rejectedBy: String(chatId) });
        await sendMessage(config.telegram.ownerChatId, `Item ${updated.orderId} rejected: ${updated.itemName || 'Stock item'}`);
        if (updated.requesterChatId && String(updated.requesterChatId) !== String(config.telegram.ownerChatId)) {
          await sendMessage(updated.requesterChatId, `Item ${updated.orderId} rejected: ${updated.itemName || 'Stock item'}`);
        }
        break;
      }

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
        if (!isOwnerChat(chatId)) {
          await sendMessage(chatId, 'Only the owner can set item status.');
          break;
        }

        const orderId = args[0];
        const status = normalizeStatus(args[1] || '');

        if (!orderId || !status) {
          await sendMessage(chatId, `Usage: /setstatus ORDER_ID STATUS\nStatuses: ${statusChoices()}`);
          break;
        }

        const updated = setOrderStatus(orderId, status);
        await notifyOrderStatus(updated, status);
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
        await sendMessage(chatId, `Unknown command.\n\n${helpText(chatId)}`);
    }
  } catch (err) {
    error('command.failed', { chatId, command, message: err.message });
    await sendMessage(chatId, `Command failed: ${err.message}`);
  }
}
