const orders = new Map();
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
