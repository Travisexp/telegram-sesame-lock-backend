export const STATUSES = {
  pending: {
    label: 'Item Pending',
    file: 'order-status-pending.gif'
  },
  approval: {
    label: 'Pending Approval',
    file: 'order-status-approval.gif'
  },
  merchant: {
    label: 'Order Sent to Merchant',
    file: 'order-status-merchant.gif'
  },
  delivery: {
    label: 'Delivery',
    file: 'order-status-delivery.gif'
  }
};

export function normalizeStatus(value = '') {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');

  if (['pending', 'itempending', 'item'].includes(normalized)) return 'pending';
  if (['approval', 'pendingapproval', 'approve'].includes(normalized)) return 'approval';
  if (['merchant', 'senttomerchant', 'ordersenttomerchant', 'sent'].includes(normalized)) return 'merchant';
  if (['delivery', 'delivering', 'delivered'].includes(normalized)) return 'delivery';

  return '';
}

export function statusChoices() {
  return Object.keys(STATUSES).join(', ');
}
