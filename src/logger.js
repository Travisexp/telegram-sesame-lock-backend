import { config } from './config.js';

function log(level, event, data = {}) {
  const safeData = {
    ...data,
    token: undefined,
    apiKey: undefined,
    secretKey: undefined
  };

  console[level](JSON.stringify({
    time: new Date().toISOString(),
    event,
    ...safeData
  }));
}

export function info(event, data) {
  if (config.commandLogEnabled) {
    log('info', event, data);
  }
}

export function warn(event, data) {
  log('warn', event, data);
}

export function error(event, data) {
  log('error', event, data);
}
