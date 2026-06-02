const orders = new Map();
const carts = new Map();
let nextOrderId = 1001;

function normalizeCartItem(item) {
  if (typeof item === 'string') {
    return { name: item, quantity: 1 };
  }

  return {
    name: item.name,
    quantity: Number(item.quantity) || 1
  };
}

export function createOrderRequest({ itemName, items = [], requesterChatId, requesterName }) {
  const normalizedItems = items.map(normalizeCartItem);
  const invoiceText = itemName || normalizedItems
    .map((item) => `${item.quantity} x ${item.name}`)
    .join('\n');
  const orderId = String(nextOrderId++);
  const order = {
    orderId,
    itemName: invoiceText,
    items: normalizedItems,
    requesterChatId: String(requesterChatId),
    requesterName,
    status: 'pending_approval',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  orders.set(orderId, order);
  return order;
}

export function setOrderStatus(orderId, status, extra = {}) {
  const existing = orders.get(String(orderId));
  const order = {
    ...existing,
    orderId,
    status,
    ...extra,
    updatedAt: new Date().toISOString()
  };

  orders.set(String(orderId), order);
  return order;
}

export function getOrder(orderId) {
  return orders.get(String(orderId));
}

export function addCartItem(chatId, itemName, quantity = 1) {
  const key = String(chatId);
  const cart = (carts.get(key) || []).map(normalizeCartItem);
  const parsedQuantity = Math.max(1, Number(quantity) || 1);
  const existing = cart.find((item) => item.name === itemName);

  if (existing) {
    existing.quantity += parsedQuantity;
  } else {
    cart.push({ name: itemName, quantity: parsedQuantity });
  }

  carts.set(key, cart);
  return cart;
}

export function getCart(chatId) {
  return (carts.get(String(chatId)) || []).map(normalizeCartItem);
}

export function clearCart(chatId) {
  carts.delete(String(chatId));
}
