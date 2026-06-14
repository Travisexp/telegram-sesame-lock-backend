import { config } from './config.js';
import { categoryNames, getCatalogItem, getCategoryItems } from './catalog.js';
import { info, warn, error } from './logger.js';
import { addCartItem, clearCart, createOrderRequest, getCart, getOrder, setOrderStatus } from './store.js';
import { normalizeStatus, statusChoices, STATUSES } from './statuses.js';
import { answerCallbackQuery, sendAnimation, sendMessage } from './telegram.js';

const permanentStaffChatIds = [
  '8822131914',
  '8959349937',
  '6355760940'
];

const staffChatIds = new Set([
  ...permanentStaffChatIds,
  ...config.telegram.staffChatIds.map(String)
]);

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

function normalizePlainText(text = '') {
  return text.trim().toLowerCase().replace(/^\//, '');
}

function helpText(chatId) {
  const sharedCommands = [
    'Stock status bot ready.',
    '',
    'Staff:',
    '/items',
    '/cart',
    '/submit',
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
    '/approve INVOICE_ID',
    '/reject INVOICE_ID',
    '/preview pending_approval',
    '/preview approved',
    '/preview merchant_received',
    '/preview delivery',
    '/setstatus INVOICE_ID pending_approval',
    '/setstatus INVOICE_ID approved',
    '/setstatus INVOICE_ID merchant_received',
    '/setstatus INVOICE_ID delivery',
    '/item INVOICE_ID'
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
    ? `Invoice ${orderId}:\n${order.itemName || 'Stock item'}\nStatus: ${statusMeta.label}`
    : orderId
      ? `Invoice ${orderId}: ${statusMeta.label}`
      : statusMeta.label;

  await sendAnimation(chatId, animationUrl, caption);
}

function categoryKeyboard() {
  const categories = categoryNames();
  const rows = [];
  for (let index = 0; index < categories.length; index += 2) {
    rows.push(categories.slice(index, index + 2).map((category) => ({
      text: category,
      callback_data: `cat:${category}`
    })));
  }
  return { inline_keyboard: rows };
}

function itemsKeyboard(category) {
  return {
    inline_keyboard: getCategoryItems(category).map((item, index) => ([
      {
        text: item,
        callback_data: `pick:${category}:${index}`
      }
    ]))
  };
}

function quantityKeyboard(category, index) {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5, 10, 20].map((quantity) => ({
        text: String(quantity),
        callback_data: `qty:${category}:${index}:${quantity}`
      })),
      [
        { text: 'Back to items', callback_data: `cat:${category}` }
      ]
    ]
  };
}

function approvalKeyboard(orderId) {
  return {
    inline_keyboard: [
      [
        { text: 'Approve', callback_data: `approve:${orderId}` },
        { text: 'Reject', callback_data: `reject:${orderId}` }
      ]
    ]
  };
}

function cartActionKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Check Cart', callback_data: 'cart:show' },
        { text: 'Checkout', callback_data: 'cart:submit' }
      ],
      [
        { text: 'Add More Items', callback_data: 'items:menu' }
      ]
    ]
  };
}

function formatInvoiceLines(items) {
  return items.map((item, index) => `${index + 1}. ${item.quantity} x ${item.name}`);
}

function orderSummary(order) {
  if (order?.items?.length) {
    return formatInvoiceLines(order.items).join('\n');
  }

  return order?.itemName || 'Stock item';
}

function parseCustomItemRequest(args) {
  const parts = [...args];
  const lastPart = parts[parts.length - 1];
  const trailingQuantity = Number(lastPart);
  const hasTrailingQuantity = Number.isInteger(trailingQuantity) && trailingQuantity > 0;
  const quantity = hasTrailingQuantity ? trailingQuantity : 1;
  const nameParts = hasTrailingQuantity ? parts.slice(0, -1) : parts;
  const itemName = nameParts.join(' ').trim();

  return { itemName, quantity };
}

async function sendItemsMenu(chatId, text = 'Hi Crew, what would you like to order today?') {
  await sendMessage(chatId, text, {
    reply_markup: categoryKeyboard()
  });
}

async function sendCart(chatId) {
  const cart = getCart(chatId);
  if (cart.length === 0) {
    await sendMessage(chatId, 'Cart is empty. Use /items to add stock.');
    return;
  }

  await sendMessage(
    chatId,
    [
      'Cart:',
      ...formatInvoiceLines(cart)
    ].join('\n'),
    {
      reply_markup: cartActionKeyboard()
    }
  );
}

async function submitCart(message) {
  const chatId = message.chat.id;
  const cart = getCart(chatId);
  if (cart.length === 0) {
    await sendMessage(chatId, 'Cart is empty. Use /items to add stock.');
    return;
  }

  const order = createOrderRequest({
    items: cart,
    requesterChatId: chatId,
    requesterName: requesterName(message)
  });
  clearCart(chatId);

  await sendMessage(
    chatId,
    [
      'Request sent for approval.',
      `Invoice ${order.orderId}:`,
      ...formatInvoiceLines(order.items)
    ].join('\n')
  );
  await sendMessage(
    config.telegram.ownerChatId,
    [
      'New stock request',
      `Invoice ${order.orderId}:`,
      ...formatInvoiceLines(order.items),
      `From: ${order.requesterName}`,
      '',
      'Tap a button below, or type:',
      `approve ${order.orderId}`,
      `reject ${order.orderId}`
    ].join('\n'),
    {
      reply_markup: approvalKeyboard(order.orderId)
    }
  );
  await sendStatusAnimation(chatId, 'pending_approval', order.orderId);
}

async function notifyOrderStatus(order, status) {
  const statusLabel = STATUSES[status]?.label || status;
  await sendMessage(config.telegram.ownerChatId, `Invoice ${order.orderId} status updated: ${statusLabel}`);

  if (order.requesterChatId && String(order.requesterChatId) !== String(config.telegram.ownerChatId)) {
    try {
      await sendStatusAnimation(order.requesterChatId, status, order.orderId);
    } catch (err) {
      error('staff.status_animation_failed', {
        chatId: order.requesterChatId,
        orderId: order.orderId,
        status,
        message: err.message
      });
      await sendMessage(
        order.requesterChatId,
        [
          `Invoice ${order.orderId} status updated: ${statusLabel}`,
          orderSummary(order)
        ].join('\n')
      );
    }
  }
}

async function approveOrder(chatId, orderId) {
  if (!isOwnerChat(chatId)) {
    await sendMessage(chatId, 'Only the owner can approve stock requests.');
    return;
  }

  if (!orderId) {
    await sendMessage(chatId, 'Usage: approve INVOICE_ID');
    return;
  }

  const order = getOrder(orderId);
  if (!order) {
    await sendMessage(chatId, `No status found for invoice ${orderId}.`);
    return;
  }

  const updated = setOrderStatus(orderId, 'approved', { approvedBy: String(chatId) });
  await notifyOrderStatus(updated, 'approved');
}

async function rejectOrder(chatId, orderId) {
  if (!isOwnerChat(chatId)) {
    await sendMessage(chatId, 'Only the owner can reject stock requests.');
    return;
  }

  if (!orderId) {
    await sendMessage(chatId, 'Usage: reject INVOICE_ID');
    return;
  }

  const order = getOrder(orderId);
  if (!order) {
    await sendMessage(chatId, `No status found for invoice ${orderId}.`);
    return;
  }

  const updated = setOrderStatus(orderId, 'rejected', { rejectedBy: String(chatId) });
  await sendMessage(config.telegram.ownerChatId, `Invoice ${updated.orderId} rejected:\n${updated.itemName || 'Stock item'}`);
  if (updated.requesterChatId && String(updated.requesterChatId) !== String(config.telegram.ownerChatId)) {
    await sendMessage(updated.requesterChatId, `Invoice ${updated.orderId} rejected:\n${updated.itemName || 'Stock item'}`);
  }
}

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery?.message?.chat?.id;
  const data = callbackQuery?.data || '';
  const callbackId = callbackQuery?.id;

  if (!chatId || !callbackId) {
    return;
  }

  if (!isAllowedChat(chatId)) {
    await answerCallbackQuery(callbackId, 'Unauthorized.');
    warn('telegram.unauthorized_callback', { chatId });
    return;
  }

  if (data.startsWith('cat:')) {
    const category = data.slice(4);
    await answerCallbackQuery(callbackId);
    await sendMessage(chatId, `${category} items:`, {
      reply_markup: itemsKeyboard(category)
    });
    return;
  }

  if (data.startsWith('pick:') || data.startsWith('add:')) {
    const [, category, index] = data.split(':');
    const itemName = getCatalogItem(category, index);
    if (!itemName) {
      await answerCallbackQuery(callbackId, 'Item not found.');
      return;
    }

    await answerCallbackQuery(callbackId);
    await sendMessage(chatId, `Choose quantity for:\n${itemName}`, {
      reply_markup: quantityKeyboard(category, index)
    });
    return;
  }

  if (data.startsWith('qty:')) {
    const [, category, index, quantity] = data.split(':');
    const itemName = getCatalogItem(category, index);
    if (!itemName) {
      await answerCallbackQuery(callbackId, 'Item not found.');
      return;
    }

    addCartItem(chatId, itemName, quantity);
    await answerCallbackQuery(callbackId, `Added ${quantity}.`);
    await sendMessage(chatId, `Added to cart:\n${quantity} x ${itemName}`, {
      reply_markup: cartActionKeyboard()
    });
    return;
  }

  if (data === 'cart:show') {
    await answerCallbackQuery(callbackId);
    await sendCart(chatId);
    return;
  }

  if (data === 'cart:submit') {
    await answerCallbackQuery(callbackId);
    await submitCart(callbackQuery.message);
    return;
  }

  if (data === 'items:menu') {
    await answerCallbackQuery(callbackId);
    await sendItemsMenu(chatId);
    return;
  }

  if (data.startsWith('approve:')) {
    const orderId = data.slice('approve:'.length);
    await answerCallbackQuery(callbackId, 'Approved.');
    await approveOrder(chatId, orderId);
    return;
  }

  if (data.startsWith('reject:')) {
    const orderId = data.slice('reject:'.length);
    await answerCallbackQuery(callbackId, 'Rejected.');
    await rejectOrder(chatId, orderId);
  }
}

export async function handleUpdate(update) {
  if (update?.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;

  if (!message || !text || !chatId) {
    return;
  }

  const { command, args } = extractCommand(text);
  const plainText = normalizePlainText(text);

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
        if (!isOwnerChat(chatId)) {
          await sendItemsMenu(chatId);
          break;
        }

        await sendMessage(chatId, helpText(chatId));
        break;

      case '/items':
        await sendItemsMenu(chatId);
        break;

      case '/cart':
        await sendCart(chatId);
        break;

      case '/submit':
        await submitCart(message);
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
        const { itemName, quantity } = parseCustomItemRequest(args);
        if (!itemName) {
          await sendMessage(chatId, 'Usage: /request ITEM_NAME');
          break;
        }

        addCartItem(chatId, itemName, quantity);
        await sendMessage(chatId, `Added custom item to cart:\n${quantity} x ${itemName}`, {
          reply_markup: cartActionKeyboard()
        });
        break;
      }

      case '/approve':
      case 'approve': {
        await approveOrder(chatId, args[0]);
        break;
      }

      case '/reject':
      case 'reject': {
        await rejectOrder(chatId, args[0]);
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
        if (['item', 'items'].includes(plainText)) {
          await sendItemsMenu(chatId);
          break;
        }

        if (plainText === 'cart') {
          await sendCart(chatId);
          break;
        }

        if (plainText === 'submit') {
          await submitCart(message);
          break;
        }

        if (!isOwnerChat(chatId)) {
          await sendItemsMenu(chatId);
          break;
        }

        await sendMessage(chatId, `Unknown command.\n\n${helpText(chatId)}`);
    }
  } catch (err) {
    error('command.failed', { chatId, command, message: err.message });
    await sendMessage(chatId, `Command failed: ${err.message}`);
  }
}
