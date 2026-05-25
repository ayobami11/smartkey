/**
 * Structured logger for SmartKey.
 *
 * In production (NODE_ENV === 'production') every entry is a single-line JSON
 * object to support log-aggregation tooling.
 *
 * In development entries are formatted for human readability.
 *
 * Stack traces are NEVER surfaced in the log message itself — the `err` field
 * of the context object may include an error message, but callers must not
 * pass raw Error objects as the `context` value. Use `logger.error` with
 * `{ err: error.message, stack: error.stack }` when you need to capture a
 * stack for internal debugging.
 *
 * Usage:
 *   logger.info('Key issued', { keyId, verifierId });
 *   logger.error('RPC failed', { err: error.message, correlationId });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

const isProduction = process.env.NODE_ENV === 'production';

const write = (level: LogLevel, message: string, context?: LogContext) => {
  const timestamp = new Date().toISOString();

  if (isProduction) {
    const entry = JSON.stringify({
      timestamp,
      level,
      message,
      ...(context ?? {}),
    });

    if (level === 'error' || level === 'warn') {
      console.error(entry);
    } else {
      console.log(entry);
    }
  } else {
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const contextStr =
      context && Object.keys(context).length > 0
        ? `\n  ${JSON.stringify(context, null, 2).split('\n').join('\n  ')}`
        : '';

    const formatted = `${prefix} ${message}${contextStr}`;

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'debug':
        console.debug(formatted);
        break;
      default:
        console.log(formatted);
    }
  }
};

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
};
