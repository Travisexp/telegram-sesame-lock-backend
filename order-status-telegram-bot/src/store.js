const orders = new Map();
const carts = new Map();
let nextOrderId = 1001;

export function createOrderRequest({ itemName, requesterChatId, requesterName }) {
  const orderId = String(nextOrderId++);
  const order = {
    orderId,
    itemName,
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

export function addCartItem(chatId, itemName) {
  const key = String(chatId);
  const cart = carts.get(key) || [];
  cart.push(itemName);
  carts.set(key, cart);
  return cart;
}

export function getCart(chatId) {
  return carts.get(String(chatId)) || [];
}

export function clearCart(chatId) {
  carts.delete(String(chatId));
}
