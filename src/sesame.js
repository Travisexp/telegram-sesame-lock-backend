import { config } from './config.js';

function sesameHeaders(extra = {}) {
  return {
    Authorization: config.sesame.apiKey,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function sesameRequest(path, options = {}) {
  const response = await fetch(`${config.sesame.apiBaseUrl}${path}`, {
    ...options,
    headers: sesameHeaders(options.headers)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error || body.message || `Sesame HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getStatus() {
  return sesameRequest(`/sesame/${encodeURIComponent(config.sesame.deviceUuid)}`);
}

export async function sendCommand(command) {
  return sesameRequest(`/sesame/${encodeURIComponent(config.sesame.deviceUuid)}`, {
    method: 'POST',
    body: JSON.stringify({ command })
  });
}

export async function getActionResult(taskId) {
  const query = new URLSearchParams({ task_id: taskId });
  return sesameRequest(`/action-result?${query.toString()}`);
}

export async function waitForActionResult(taskId) {
  let lastResult = null;

  for (let attempt = 1; attempt <= config.sesame.resultAttempts; attempt += 1) {
    lastResult = await getActionResult(taskId);
    if (lastResult.status === 'terminated') {
      return lastResult;
    }

    if (attempt < config.sesame.resultAttempts) {
      await sleep(config.sesame.resultDelayMs);
    }
  }

  return lastResult;
}

export function formatStatus(status) {
  const locked = typeof status.locked === 'boolean'
    ? (status.locked ? 'locked' : 'unlocked')
    : 'unknown';
  const battery = Number.isFinite(status.battery) ? `${status.battery}%` : 'unknown';
  const responsive = typeof status.responsive === 'boolean'
    ? (status.responsive ? 'yes' : 'no')
    : 'unknown';

  return `Lock: ${locked}\nBattery: ${battery}\nResponsive: ${responsive}`;
}
