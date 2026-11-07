// pool.js: the pg connection pool. The API always connects as resolvd_app (DATABASE_URL), so
// row-level security applies to every query. Tenant queries must go through withOrg(), never pool.query.
import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * @param {{ connectionString: string, logger?: import('pino').Logger, max?: number }} options
 * @returns {import('pg').Pool}
 */
export function createPool({ connectionString, logger: log, max = 10 }) {
  const p = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    application_name: 'screenguide-api',
  });
  // An idle client can error (e.g. the server restarts); without a listener Node would crash.
  p.on('error', (err) => {
    log?.error({ err }, 'idle database client error');
  });
  return p;
}

/** The shared runtime pool (resolvd_app). */
export const pool = createPool({ connectionString: env.DATABASE_URL, logger });
