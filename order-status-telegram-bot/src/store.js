const orders = new Map();

export function setOrderStatus(orderId, status) {
  const order = {
    orderId,
    status,
    updatedAt: new Date().toISOString()
  };

  orders.set(String(orderId), order);
  return order;
}

export function getOrder(orderId) {
  return orders.get(String(orderId));
}
