import { config } from './config.js';
import { info, warn, error } from './logger.js';
import { sendMessage } from './telegram.js';
import {
  formatStatus,
  getStatus,
  sendCommand,
  waitForActionResult
} from './sesame.js';

function extractCommand(text = '') {
  const [rawCommand = '', ...args] = text.trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  return { command, args };
}

function isAllowedChat(chatId) {
  return String(chatId) === String(config.telegram.allowedChatId);
}

function helpText() {
  return [
    'Sesame lock bot ready.',
    '',
    'Commands:',
    '/status - show lock status',
    '/battery - show battery level',
    '/lock - lock Sesame',
    '/unlock confirm - unlock Sesame',
    '/sync - sync Sesame status'
  ].join('\n');
}

async function replyStatus(chatId, prefix = 'Current status:') {
  const status = await getStatus();
  await sendMessage(chatId, `${prefix}\n${formatStatus(status)}`);
}

async function runSesameCommand(chatId, command, successVerb) {
  const accepted = await sendCommand(command);
  const taskId = accepted.task_id;

  if (!taskId) {
    await replyStatus(chatId, `${successVerb} command accepted, but Sesame did not return a task ID.`);
    return;
  }

  const result = await waitForActionResult(taskId);
  if (result?.status === 'terminated' && result.successful === true) {
    await replyStatus(chatId, `${successVerb} succeeded.`);
    return;
  }

  if (result?.status === 'terminated') {
    const reason = result.error ? ` Reason: ${result.error}` : '';
    await replyStatus(chatId, `${successVerb} failed.${reason}`);
    return;
  }

  await replyStatus(chatId, `${successVerb} is still processing. Task ID: ${taskId}`);
}

export async function handleUpdate(update) {
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;

  if (!message || !text || !chatId) {
    return;
  }

  const { command, args } = extractCommand(text);

  if (!isAllowedChat(chatId)) {
    warn('telegram.unauthorized_chat', {
      chatId,
      command
    });
    await sendMessage(chatId, 'Unauthorized.');
    return;
  }

  info('telegram.command', {
    chatId,
    command
  });

  try {
    switch (command) {
      case '/start':
        await sendMessage(chatId, helpText());
        break;
      case '/status':
        await replyStatus(chatId);
        break;
      case '/battery': {
        const status = await getStatus();
        const battery = Number.isFinite(status.battery) ? `${status.battery}%` : 'unknown';
        await sendMessage(chatId, `Battery: ${battery}\n${formatStatus(status)}`);
        break;
      }
      case '/lock':
        await runSesameCommand(chatId, 'lock', 'Lock');
        break;
      case '/unlock':
        if (args[0]?.toLowerCase() !== 'confirm') {
          await sendMessage(chatId, 'For safety, send /unlock confirm to unlock Sesame.');
          break;
        }
        await runSesameCommand(chatId, 'unlock', 'Unlock');
        break;
      case '/sync':
        await runSesameCommand(chatId, 'sync', 'Sync');
        break;
      default:
        await sendMessage(chatId, `Unknown command.\n\n${helpText()}`);
    }
  } catch (err) {
    error('command.failed', {
      chatId,
      command,
      message: err.message
    });
    await sendMessage(chatId, `Command failed: ${err.message}`);
  }
}
