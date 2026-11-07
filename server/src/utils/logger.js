// logger.js: the pino logger. Secrets and private content (cookies, auth headers, passwords, API keys,
// screen frames, audio, transcripts) are redacted from every log line. Pretty output in development.
import pino from 'pino';
import { env } from '../config/env.js';

/** Paths removed from log objects (pino `redact`). Keep in sync with CLAUDE.md's logging rule. */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["idempotency-key"]',
  'res.headers["set-cookie"]',
  'headers.cookie',
  'headers.authorization',
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.ticket',
  '*.apiKey',
  '*.api_key',
  '*.secret',
  '*.frame',
  '*.audio',
  '*.transcript',
  '*.content',
  'password',
  'apiKey',
  'frame',
  'audio',
  'transcript',
];

/**
 * @param {{ level?: string, pretty?: boolean, destination?: import('pino').DestinationStream }} [options]
 * @returns {import('pino').Logger}
 */
export function createLogger({ level = 'info', pretty = false, destination } = {}) {
  /** @type {import('pino').LoggerOptions} */
  const options = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: 'screenguide-api' },
  };
  if (destination) return pino(options, destination);
  if (pretty) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
      },
    });
  }
  return pino(options);
}

/** The shared application logger. */
export const logger = createLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === 'development',
});
