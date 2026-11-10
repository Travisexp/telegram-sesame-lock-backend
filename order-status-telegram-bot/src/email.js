import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { getOrder, setOrderStatus } from './store.js';

const ONE_DAY = 24 * 60 * 60 * 1000;

export function emailIsConfigured() {
  return Boolean(config.email.smtpHost && config.email.smtpUser && config.email.smtpPassword && config.publicBaseUrl);
}

export async function sendApprovalEmail(order) {
  if (!emailIsConfigured()) return false;

  const token = randomBytes(32).toString('hex');
  setOrderStatus(order.orderId, order.status, {
    emailToken: token,
    emailTokenExpiresAt: Date.now() + ONE_DAY
  });

  const base = `${config.publicBaseUrl.replace(/\/$/, '')}/email/decision`;
  const lines = order.items.map((item, index) => `${index + 1}. ${item.quantity} x ${item.name}`);
  const transporter = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpPort === 465,
    auth: { user: config.email.smtpUser, pass: config.email.smtpPassword }
  });

  await transporter.sendMail({
    from: config.email.smtpUser,
    to: config.email.to,
    subject: `Stock invoice ${order.orderId} needs approval`,
    text: [
      `Invoice ${order.orderId} from ${order.requesterName}`,
      ...lines,
      '',
      `Approve: ${base}?orderId=${encodeURIComponent(order.orderId)}&action=approve&token=${token}`,
      `Reject: ${base}?orderId=${encodeURIComponent(order.orderId)}&action=reject&token=${token}`
    ].join('\n')
  });
  return true;
}

export function getEmailDecision(orderId, action, token) {
  const order = getOrder(orderId);
  if (!['approve', 'reject'].includes(action) || !order || !token ||
      order.emailToken !== token || Date.now() > order.emailTokenExpiresAt) {
    return null;
  }
  return order;
}
