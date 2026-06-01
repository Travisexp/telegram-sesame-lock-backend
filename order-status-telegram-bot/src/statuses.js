export const STATUSES = {
  pending_approval: {
    label: 'Pending Approval',
    file: 'stock-status-pending-approval.gif'
  },
  approved: {
    label: 'Approved',
    file: 'stock-status-approved.gif'
  },
  merchant_received: {
    label: 'Merchant Received',
    file: 'stock-status-merchant-received.gif'
  },
  delivery: {
    label: 'Delivery',
    file: 'stock-status-delivery.gif'
  },
  rejected: {
    label: 'Rejected',
    file: 'stock-status-pending-approval.gif'
  }
};

export function normalizeStatus(value = '') {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');

  if (['pending', 'pendingapproval', 'waitingapproval', 'waitapproval', 'staffwaiting'].includes(normalized)) {
    return 'pending_approval';
  }
  if (['approved', 'approve'].includes(normalized)) return 'approved';
  if (['merchant', 'merchantreceived', 'merchantreceive', 'received', 'supplierreceived'].includes(normalized)) {
    return 'merchant_received';
  }
  if (['delivery', 'delivering', 'delivered'].includes(normalized)) return 'delivery';
  if (['rejected', 'reject', 'cancelled', 'canceled'].includes(normalized)) return 'rejected';

  return '';
}

export function statusChoices() {
  return Object.keys(STATUSES).join(', ');
}
