// server.js: starts the API: HTTP server, then the pg-boss job queue, and wires SIGTERM/SIGINT to the
// graceful shutdown sequence in shutdown.js. Phase 5 adds the WebSocket server.
import { env } from './config/env.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';
import { createJobs } from './jobs/index.js';
import { createShutdown } from './shutdown.js';
import { logger } from './utils/logger.js';

const JOB_START_RETRY_MS = 15000;

const jobs = createJobs({ connectionString: env.DATABASE_URL, logger });
const app = createApp({ pool, jobs, logger });

// Render needs 0.0.0.0; locally stay on loopback (Resolvd uses localhost:4000).
const host = env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
const server = app.listen(env.PORT, host, () => {
  logger.info(`ScreenGuide API listening on http://${host}:${env.PORT}`);
});

// Start the job queue. If the database isn't reachable yet, keep serving (/api/ready reports 503)
// and retry, so a slow database doesn't crash-loop the service.
let stopping = false;
let retryTimer;
async function startJobs() {
  try {
    await jobs.start();
  } catch (err) {
    logger.error({ err }, `job queue failed to start; retrying in ${JOB_START_RETRY_MS / 1000} s`);
    if (!stopping) retryTimer = setTimeout(startJobs, JOB_START_RETRY_MS);
  }
}
startJobs();

const shutdown = createShutdown({
  server,
  jobs,
  pool,
  logger,
  beforeStop: () => {
    stopping = true;
    clearTimeout(retryTimer);
  },
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
