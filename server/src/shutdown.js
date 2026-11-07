// shutdown.js: the graceful shutdown sequence (plan Section 8.8), kept separate from server.js so it
// can be unit-tested. Order: stop accepting HTTP (in-flight requests finish) → [Phase 5: tell
// WebSocket clients and close them with 1012] → stop jobs (running jobs get up to jobTimeoutMs) →
// close the database pool → exit 0. A hard timer forces exit 1 if anything hangs.

/**
 * @param {{
 *   server: { close(cb: (err?: Error) => void): void, closeIdleConnections?(): void },
 *   jobs: { stop(options: { timeout: number }): Promise<void> },
 *   pool: { end(): Promise<void> },
 *   logger: import('pino').Logger,
 *   exit?: (code: number) => void,
 *   jobTimeoutMs?: number,
 *   forceExitMs?: number,
 *   beforeStop?: () => void,
 * }} deps
 * @returns {(signal: string) => Promise<void>}
 */
export function createShutdown({
  server,
  jobs,
  pool,
  logger,
  exit = (code) => process.exit(code),
  jobTimeoutMs = 10000,
  forceExitMs = 20000,
  beforeStop,
}) {
  let started = false;

  return async function shutdown(signal) {
    if (started) return;
    started = true;
    beforeStop?.();
    logger.info({ signal }, 'shutting down');

    const forceTimer = setTimeout(() => {
      logger.error('graceful shutdown timed out; forcing exit');
      exit(1);
    }, forceExitMs);
    forceTimer.unref?.();

    try {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeIdleConnections?.();
      });
      await jobs.stop({ timeout: jobTimeoutMs });
      await pool.end();
      clearTimeout(forceTimer);
      logger.info('shutdown complete');
      exit(0);
    } catch (err) {
      clearTimeout(forceTimer);
      logger.error({ err }, 'error during shutdown');
      exit(1);
    }
  };
}
