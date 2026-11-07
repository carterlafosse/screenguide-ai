// helpers.js: shared test helpers (log capture, seeded user lookup). Phase 3 adds loginAs(email).
import { createLogger } from '../src/utils/logger.js';

/**
 * A real pino logger (same redaction as production) that keeps every line as a parsed object.
 * @param {string} [level]
 */
export function captureLogger(level = 'info') {
  /** @type {Record<string, any>[]} */
  const lines = [];
  const logger = createLogger({
    level,
    destination: { write: (chunk) => lines.push(JSON.parse(chunk)) },
  });
  return { logger, lines };
}

/** Resolves after `ms` milliseconds. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll `check` until it returns a truthy value or the timeout passes.
 * @template T
 * @param {() => Promise<T> | T} check
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function waitFor(check, { timeoutMs = 10000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await sleep(intervalMs);
  }
}
