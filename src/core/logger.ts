/* eslint-disable no-console -- the logger is the single sanctioned console sink */
type Level = 'debug' | 'info' | 'warn' | 'error';

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

const emit = (level: Level, scope: string, message: string, meta?: unknown): void => {
  if (level === 'debug' && !isDev) return;
  const line = `[${scope}] ${message}`;
  const args = meta === undefined ? [line] : [line, meta];
  switch (level) {
    case 'debug':
    case 'info':
      console.log(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'error':
      console.error(...args);
      break;
  }
};

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

/** Scoped logger. Swap `emit` for Sentry/Datadog breadcrumbs in production. */
export const createLogger = (scope: string): Logger => ({
  debug: (m, meta) => emit('debug', scope, m, meta),
  info: (m, meta) => emit('info', scope, m, meta),
  warn: (m, meta) => emit('warn', scope, m, meta),
  error: (m, meta) => emit('error', scope, m, meta),
});
