// health.routes.js: liveness and readiness (plan Section 8.7).
//   GET /api/health  → 200 { status: 'ok' } without touching the database (is the process alive?)
//   GET /api/ready   → { status, database, jobs }; 503 if the database or the job queue is down.
//                      Render's health check points here.
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

  router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
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
      .json({ status: ready ? 'ok' : 'unavailable', database, jobs: jobsState });
  });

  return router;
}
