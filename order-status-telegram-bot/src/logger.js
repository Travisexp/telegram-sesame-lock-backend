function write(level, event, data = {}) {
  const safeData = Object.fromEntries(
    Object.entries(data).filter(([key]) => !key.toLowerCase().includes('token') && !key.toLowerCase().includes('secret'))
  );

  console.log(JSON.stringify({
    level,
    event,
    ...safeData,
    time: new Date().toISOString()
  }));
}

export function info(event, data) {
  write('info', event, data);
}

export function warn(event, data) {
  write('warn', event, data);
}

export function error(event, data) {
  write('error', event, data);
}
