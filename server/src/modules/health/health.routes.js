// health.routes.js: health and readiness.
//   GET /api/health → SELECT 1 → 200 { status: 'ok', database: 'up' }, or
//                     503 { status: 'degraded', database: 'down' }. Same contract as Resolvd's
//                     health route; Render's health check points here.
//   GET /api/ready  → ScreenGuide addition (plan Section 4.2): also checks the job queue →
//                     { status, database, jobs }, 503 'degraded' if either is down.
import { Router } from 'express';

const CHECK_TIMEOUT_MS = 2000;

/**
 * @template T
 * @param {Promise<T>} promise
 */
function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS).unref(),
    ),
  ]);
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<'up' | 'down'>}
 */
async function checkDatabase(pool) {
  try {
    // Not a tenant query: it reads no table, so it doesn't need withOrg.
    await withTimeout(pool.query('SELECT 1'));
    return 'up';
  } catch {
    return 'down';
  }
}

/**
 * @param {{ pool: import('pg').Pool, jobs: { isUp(): Promise<boolean> } | null }} deps
 */
export function healthRouter({ pool, jobs }) {
  const router = Router();

  router.get('/health', async (req, res) => {
    const database = await checkDatabase(pool);
    if (database === 'down') req.log?.warn({ database }, 'health check failed');
    res
      .status(database === 'up' ? 200 : 503)
      .json({ status: database === 'up' ? 'ok' : 'degraded', database });
  });

  router.get('/ready', async (req, res) => {
    const [database, jobsUp] = await Promise.all([
      checkDatabase(pool),
      jobs ? jobs.isUp() : Promise.resolve(false),
    ]);
    const jobsState = jobsUp ? 'up' : 'down';
    const ready = database === 'up' && jobsState === 'up';
    if (!ready) req.log?.warn({ database, jobs: jobsState }, 'not ready');
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? 'ok' : 'degraded', database, jobs: jobsState });
  });

  return router;
}
