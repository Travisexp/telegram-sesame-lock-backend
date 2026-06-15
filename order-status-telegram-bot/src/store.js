import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.join(os.tmpdir(), 'order-status-telegram-bot');
const storePath = path.join(dataDir, 'store.json');
const orders = new Map();
const carts = new Map();
let nextOrderId = 1001;

function loadStore() {
  if (!existsSync(storePath)) {
    return;
  }

  const raw = readFileSync(storePath, 'utf8');
  if (!raw.trim()) {
    return;
  }

  const parsed = JSON.parse(raw);
  nextOrderId = Number(parsed.nextOrderId) || nextOrderId;
  for (const order of parsed.orders || []) {
    if (order?.orderId) {
      orders.set(String(order.orderId), order);
    }
  }
  for (const [chatId, cart] of Object.entries(parsed.carts || {})) {
    carts.set(String(chatId), (cart || []).map(normalizeCartItem));
  }
}

function saveStore() {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(storePath, JSON.stringify({
    nextOrderId,
    orders: Array.from(orders.values()),
    carts: Object.fromEntries(carts)
  }, null, 2));
}

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
  saveStore();
  return order;
}

export function setOrderStatus(orderId, status, extra = {}) {
  const existing = orders.get(String(orderId));
  const order = {
    ...existing,
    ...extra,
    orderId,
    status,
    updatedAt: new Date().toISOString()
  };

  orders.set(String(orderId), order);
  saveStore();
  return order;
}

export function getOrder(orderId) {
  return orders.get(String(orderId));
}

export function listOrders(limit = 10) {
  return Array.from(orders.values())
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);
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
  saveStore();
  return cart;
}

export function getCart(chatId) {
  return (carts.get(String(chatId)) || []).map(normalizeCartItem);
}

export function clearCart(chatId) {
  carts.delete(String(chatId));
  saveStore();
}

loadStore();
