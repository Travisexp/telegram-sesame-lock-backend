import { config } from './config.js';
import { sendApprovalEmail } from './email.js';
import { categoryNames, getCatalogItem, getCategoryItems } from './catalog.js';
import { info, warn, error } from './logger.js';
import { addCartItem, clearCart, createOrderRequest, getCart, getOrder, listOrders, setCartItemQuantity, setOrderStatus } from './store.js';
import { normalizeStatus, statusChoices, STATUSES } from './statuses.js';
import { answerCallbackQuery, sendAnimation, sendMessage } from './telegram.js';

const permanentStaffChatIds = [
  '8822131914',
  '8959349937',
  '6355760940',
  '9059204712'
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
    '/stockupdate',
    '/outofstock INVOICE_ID',
    '/available INVOICE_ID',
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

function ownerDashboardKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Update Staff: Out of Stock', callback_data: 'oos_start' }
      ],
      [
        { text: 'Preview Merchant Received', callback_data: 'preview:merchant_received' },
        { text: 'Preview Delivery', callback_data: 'preview:delivery' }
      ]
    ]
  };
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
      ],
      [
        { text: 'Pick Out of Stock', callback_data: `oos_menu:${orderId}` },
        { text: 'All Available', callback_data: `available:${orderId}` }
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

function cartKeyboard(cart) {
  return {
    inline_keyboard: [
      ...cart.map((item, index) => ([{
        text: `Edit ${shortButtonText(`${item.quantity} x ${item.name}`)}`,
        callback_data: `cart:edit:${index}`
      }])),
      ...cartActionKeyboard().inline_keyboard
    ]
  };
}

function cartItemKeyboard(index) {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5, 10, 20].map((quantity) => ({
        text: String(quantity),
        callback_data: `cart:set:${index}:${quantity}`
      })),
      [
        { text: '-1', callback_data: `cart:adjust:${index}:-1` },
        { text: '+1', callback_data: `cart:adjust:${index}:1` },
        { text: 'Remove', callback_data: `cart:set:${index}:0` }
      ],
      [{ text: 'Back to Cart', callback_data: 'cart:show' }]
    ]
  };
}

function formatInvoiceLines(items) {
  return items.map((item, index) => `${index + 1}. ${item.quantity} x ${item.name}`);
}

function shortButtonText(text) {
  return text.length > 42 ? `${text.slice(0, 39)}...` : text;
}

function stockAvailabilityKeyboard(order) {
  const selected = new Set(order.outOfStockItems || []);
  const itemRows = (order.items || []).map((item, index) => {
    const itemText = `${item.quantity} x ${item.name}`;
    const prefix = selected.has(item.name) ? 'Remove' : 'Out';
    return [{
      text: `${prefix}: ${shortButtonText(itemText)}`,
      callback_data: `oos_toggle:${order.orderId}:${index}`
    }];
  });

  return {
    inline_keyboard: [
      ...itemRows,
      [
        { text: 'Send Update', callback_data: `oos_send:${order.orderId}` },
        { text: 'All Available', callback_data: `available:${order.orderId}` }
      ],
      [
        { text: 'Clear Selection', callback_data: `oos_clear:${order.orderId}` }
      ]
    ]
  };
}

function invoicePickerKeyboard(orders) {
  return {
    inline_keyboard: orders.map((order) => ([{
      text: `Invoice ${order.orderId}: ${shortButtonText(orderSummary(order).replace(/\n/g, ', '))}`,
      callback_data: `oos_menu:${order.orderId}`
    }]))
  };
}

function orderSummary(order) {
  if (order?.items?.length) {
    return formatInvoiceLines(order.items).join('\n');
  }

  return order?.itemName || 'Stock item';
}

function parseCustomItemRequests(args) {
  const parts = [...args];
  const items = [];
  let index = 0;

  while (index < parts.length) {
    const quantity = Number(parts[index]);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      break;
    }

    index += 1;
    const nameParts = [];
    while (index < parts.length) {
      const nextQuantity = Number(parts[index]);
      if (Number.isInteger(nextQuantity) && nextQuantity > 0) {
        break;
      }
      nameParts.push(parts[index]);
      index += 1;
    }

    const name = nameParts.join(' ').trim();
    if (name) {
      items.push({ name, quantity });
    }
  }

  if (items.length && index === parts.length) {
    return items;
  }

  const lastPart = parts[parts.length - 1];
  const trailingQuantity = Number(lastPart);
  const hasTrailingQuantity = Number.isInteger(trailingQuantity) && trailingQuantity > 0;
  const quantity = hasTrailingQuantity ? trailingQuantity : 1;
  const nameParts = hasTrailingQuantity ? parts.slice(0, -1) : parts;
  const name = nameParts.join(' ').trim();

  return name ? [{ name, quantity }] : [];
}

function parseApprovalMessage(text = '') {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const invoiceLine = lines.find((line) => /^Invoice\s+\S+:/i.test(line));
  const orderId = invoiceLine?.match(/^Invoice\s+([^:]+):/i)?.[1];
  const requesterChatId = lines.find((line) => /^Staff chat ID:/i.test(line))?.replace(/^Staff chat ID:\s*/i, '');
  const requesterName = lines.find((line) => /^From:/i.test(line))?.replace(/^From:\s*/i, '') || 'Staff';
  const items = lines
    .map((line) => line.match(/^\d+\.\s+(\d+)\s+x\s+(.+)$/i))
    .filter(Boolean)
    .map((match) => ({
      quantity: Number(match[1]) || 1,
      name: match[2]
    }));

  if (!orderId || !requesterChatId) {
    return null;
  }

  return {
    orderId,
    itemName: items.length ? items.map((item) => `${item.quantity} x ${item.name}`).join('\n') : 'Stock item',
    items,
    requesterChatId,
    requesterName,
    status: 'pending_approval',
    createdAt: new Date().toISOString()
  };
}

function restoreOrder(order) {
  if (!order?.orderId) {
    return null;
  }

  return setOrderStatus(order.orderId, order.status || 'pending_approval', order);
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
      reply_markup: cartKeyboard(cart)
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
      `Staff chat ID: ${chatId}`,
      '',
      'Tap a button below, or type:',
      `approve ${order.orderId}`,
      `reject ${order.orderId}`
    ].join('\n'),
    {
      reply_markup: approvalKeyboard(order.orderId)
    }
  );
  try {
    await sendApprovalEmail(order);
  } catch (err) {
    error('approval_email.failed', { orderId: order.orderId });
    await sendMessage(config.telegram.ownerChatId, `Email delivery failed for invoice ${order.orderId}. Please use the Telegram approval buttons.`);
  }
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

export async function decideOrderFromEmail(orderId, action, token) {
  const order = getOrder(orderId);
  if (!order || order.status !== 'pending_approval' || order.emailToken !== token ||
      !token || Date.now() > order.emailTokenExpiresAt) {
    return false;
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  const updated = setOrderStatus(orderId, status, {
    emailToken: null,
    emailTokenExpiresAt: null,
    decidedBy: 'email'
  });
  if (status === 'approved') {
    await notifyOrderStatus(updated, status);
  } else {
    await sendMessage(config.telegram.ownerChatId, `Invoice ${orderId} rejected by email.`);
    await sendMessage(updated.requesterChatId, `Invoice ${orderId} rejected:\n${orderSummary(updated)}`);
  }
  return true;
}

async function notifyStockAvailability(chatId, orderId, outOfStockItems) {
  if (!isOwnerChat(chatId)) {
    await sendMessage(chatId, 'Only the owner can send stock availability updates.');
    return;
  }

  if (!orderId) {
    await sendMessage(chatId, 'Usage: /outofstock INVOICE_ID ITEM_NAMES');
    return;
  }

  const order = getOrder(orderId);
  if (!order) {
    await sendMessage(chatId, `No status found for invoice ${orderId}.`);
    return;
  }

  if (!order.requesterChatId || String(order.requesterChatId) === String(config.telegram.ownerChatId)) {
    await sendMessage(chatId, `Invoice ${orderId} has no staff requester to notify.`);
    return;
  }

  const message = outOfStockItems.length
    ? [
        `Invoice ${orderId} stock update:`,
        'Out of stock at the moment:',
        ...outOfStockItems.map((item) => `- ${item}`),
        '',
        'Order:',
        orderSummary(order)
      ].join('\n')
    : [
        `Invoice ${orderId} stock update:`,
        'All requested items are currently available.',
        '',
        'Order:',
        orderSummary(order)
      ].join('\n');

  await sendMessage(order.requesterChatId, message);
  await sendMessage(chatId, `Stock availability update sent to staff for invoice ${orderId}.`);
}

async function sendOutOfStockPicker(chatId, orderId, fallbackOrder = null) {
  if (!isOwnerChat(chatId)) {
    await sendMessage(chatId, 'Only the owner can send stock availability updates.');
    return;
  }

  if (!orderId) {
    const recentOrders = listOrders(8).filter((order) => order.items?.length);
    if (!recentOrders.length) {
      await sendMessage(chatId, 'No recent invoices found yet. Reply to the original invoice message with /outofstock.');
      return;
    }

    await sendMessage(chatId, 'Which invoice has out-of-stock items?', {
      reply_markup: invoicePickerKeyboard(recentOrders)
    });
    return;
  }

  const order = getOrder(orderId) || restoreOrder(fallbackOrder);
  if (!order) {
    await sendMessage(chatId, `No status found for invoice ${orderId}.`);
    return;
  }

  if (!order.items?.length) {
    await sendMessage(chatId, `Invoice ${orderId} has no item list to pick from.`);
    return;
  }

  await sendMessage(
    chatId,
    [
      `Pick out-of-stock items for invoice ${orderId}:`,
      ...formatInvoiceLines(order.items)
    ].join('\n'),
    {
      reply_markup: stockAvailabilityKeyboard(order)
    }
  );
}

async function toggleOutOfStockItem(chatId, orderId, itemIndex) {
  if (!isOwnerChat(chatId)) {
    await sendMessage(chatId, 'Only the owner can send stock availability updates.');
    return;
  }

  const order = getOrder(orderId);
  const item = order?.items?.[itemIndex];
  if (!order || !item) {
    await sendMessage(chatId, `No item found for invoice ${orderId}.`);
    return;
  }

  const selected = new Set(order.outOfStockItems || []);
  if (selected.has(item.name)) {
    selected.delete(item.name);
  } else {
    selected.add(item.name);
  }

  const updated = setOrderStatus(orderId, order.status || 'approved', {
    ...order,
    outOfStockItems: Array.from(selected)
  });

  await sendMessage(chatId, `Updated out-of-stock selection for invoice ${orderId}.`, {
    reply_markup: stockAvailabilityKeyboard(updated)
  });
}

async function approveOrder(chatId, orderId, fallbackOrder = null) {
  if (!isOwnerChat(chatId)) {
    await sendMessage(chatId, 'Only the owner can approve stock requests.');
    return;
  }

  if (!orderId) {
    await sendMessage(chatId, 'Usage: approve INVOICE_ID');
    return;
  }

  const order = getOrder(orderId) || fallbackOrder;
  if (!order) {
    await sendMessage(chatId, `No status found for invoice ${orderId}.`);
    return;
  }

  if (order.status !== 'pending_approval') {
    await sendMessage(chatId, `Invoice ${orderId} is already ${order.status}.`);
    return;
  }

  const updated = setOrderStatus(orderId, 'approved', { ...order, approvedBy: String(chatId), emailToken: null });
  await notifyOrderStatus(updated, 'approved');
}

async function rejectOrder(chatId, orderId, fallbackOrder = null) {
  if (!isOwnerChat(chatId)) {
    await sendMessage(chatId, 'Only the owner can reject stock requests.');
    return;
  }

  if (!orderId) {
    await sendMessage(chatId, 'Usage: reject INVOICE_ID');
    return;
  }

  const order = getOrder(orderId) || fallbackOrder;
  if (!order) {
    await sendMessage(chatId, `No status found for invoice ${orderId}.`);
    return;
  }

  if (order.status !== 'pending_approval') {
    await sendMessage(chatId, `Invoice ${orderId} is already ${order.status}.`);
    return;
  }

  const updated = setOrderStatus(orderId, 'rejected', { ...order, rejectedBy: String(chatId), emailToken: null });
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

  if (data.startsWith('cart:edit:')) {
    const index = Number(data.slice('cart:edit:'.length));
    const item = getCart(chatId)[index];
    await answerCallbackQuery(callbackId, item ? undefined : 'Cart item no longer exists.');
    if (item) {
      await sendMessage(chatId, `Change quantity for:\n${item.quantity} x ${item.name}`, {
        reply_markup: cartItemKeyboard(index)
      });
    }
    return;
  }

  if (data.startsWith('cart:set:') || data.startsWith('cart:adjust:')) {
    const [, action, indexText, amountText] = data.split(':');
    const index = Number(indexText);
    const amount = Number(amountText);
    const item = getCart(chatId)[index];
    const quantity = action === 'adjust' ? (item?.quantity || 0) + amount : amount;
    if (!item || !setCartItemQuantity(chatId, index, quantity)) {
      await answerCallbackQuery(callbackId, 'Cart item no longer exists.');
      return;
    }
    await answerCallbackQuery(callbackId, quantity === 0 ? 'Removed.' : 'Quantity updated.');
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

  if (data === 'oos_start') {
    await answerCallbackQuery(callbackId);
    await sendOutOfStockPicker(chatId);
    return;
  }

  if (data.startsWith('preview:')) {
    const status = normalizeStatus(data.slice('preview:'.length));
    await answerCallbackQuery(callbackId);
    if (status) {
      await sendStatusAnimation(chatId, status);
    }
    return;
  }

  if (data.startsWith('oos_menu:')) {
    const orderId = data.slice('oos_menu:'.length);
    await answerCallbackQuery(callbackId);
    await sendOutOfStockPicker(chatId, orderId, parseApprovalMessage(callbackQuery.message?.text));
    return;
  }

  if (data.startsWith('oos_toggle:')) {
    const [, orderId, itemIndex] = data.split(':');
    await answerCallbackQuery(callbackId, 'Updated.');
    await toggleOutOfStockItem(chatId, orderId, Number(itemIndex));
    return;
  }

  if (data.startsWith('oos_send:')) {
    const orderId = data.slice('oos_send:'.length);
    const order = getOrder(orderId);
    await answerCallbackQuery(callbackId, 'Sending update.');
    await notifyStockAvailability(chatId, orderId, order?.outOfStockItems || []);
    return;
  }

  if (data.startsWith('oos_clear:')) {
    const orderId = data.slice('oos_clear:'.length);
    const order = getOrder(orderId);
    if (order) {
      setOrderStatus(orderId, order.status || 'approved', { ...order, outOfStockItems: [] });
    }
    await answerCallbackQuery(callbackId, 'Cleared.');
    await sendOutOfStockPicker(chatId, orderId);
    return;
  }

  if (data.startsWith('available:')) {
    const orderId = data.slice('available:'.length);
    await answerCallbackQuery(callbackId, 'Sending update.');
    await notifyStockAvailability(chatId, orderId, []);
    return;
  }

  if (data.startsWith('approve:')) {
    const orderId = data.slice('approve:'.length);
    await answerCallbackQuery(callbackId, 'Approved.');
    await approveOrder(chatId, orderId, parseApprovalMessage(callbackQuery.message?.text));
    return;
  }

  if (data.startsWith('reject:')) {
    const orderId = data.slice('reject:'.length);
    await answerCallbackQuery(callbackId, 'Rejected.');
    await rejectOrder(chatId, orderId, parseApprovalMessage(callbackQuery.message?.text));
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

        await sendMessage(chatId, helpText(chatId), {
          reply_markup: ownerDashboardKeyboard()
        });
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
        const customItems = parseCustomItemRequests(args);
        if (!customItems.length) {
          await sendMessage(chatId, 'Usage: /request ITEM_NAME');
          break;
        }

        for (const item of customItems) {
          addCartItem(chatId, item.name, item.quantity);
        }
        await sendMessage(
          chatId,
          [
            'Added custom item to cart:',
            ...formatInvoiceLines(customItems)
          ].join('\n'),
          {
            reply_markup: cartActionKeyboard()
          }
        );
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

      case '/stockupdate':
      case 'stockupdate': {
        await sendOutOfStockPicker(chatId, args[0], parseApprovalMessage(message.reply_to_message?.text));
        break;
      }

      case '/outofstock':
      case 'outofstock': {
        const orderId = args[0];
        const outOfStockItems = args.slice(1).join(' ').split(',').map((item) => item.trim()).filter(Boolean);
        if (!outOfStockItems.length) {
          await sendOutOfStockPicker(chatId, orderId, parseApprovalMessage(message.reply_to_message?.text));
          break;
        }
        await notifyStockAvailability(chatId, orderId, outOfStockItems);
        break;
      }

      case '/available':
      case 'available': {
        await notifyStockAvailability(chatId, args[0], []);
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
