// health.test.js: liveness and readiness. /api/ready is 200 only when both the database and the
// job queue are up, and 503 (saying which is down) otherwise, e.g. when Postgres is unreachable.
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool } from '../../src/db/pool.js';
import { captureLogger } from '../helpers.js';

const { logger } = captureLogger();
const jobsUp = { isUp: async () => true };
const jobsDown = { isUp: async () => false };
// Nothing listens on port 1, so every connection attempt fails like a stopped Postgres.
const deadPool = createPool({
  connectionString: 'postgres://resolvd_app:x@127.0.0.1:1/screenguide_test',
});

afterAll(async () => {
  await deadPool.end();
});

describe('GET /api/health', () => {
  it('returns 200 { status: ok } without needing the database', async () => {
    const res = await request(createApp({ logger, pool: deadPool, jobs: jobsDown })).get(
      '/api/health',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/ready', () => {
  it('200 when the database and jobs are up', async () => {
    const res = await request(createApp({ logger, jobs: jobsUp })).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', jobs: 'up' });
  });

  it('503 with database: down when Postgres is unreachable', async () => {
    const res = await request(createApp({ logger, pool: deadPool, jobs: jobsUp })).get(
      '/api/ready',
    );
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable', database: 'down', jobs: 'up' });
  });

  it('503 with jobs: down when the job queue is not running', async () => {
    const res = await request(createApp({ logger, jobs: jobsDown })).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable', database: 'up', jobs: 'down' });
  });

  it('503 when no job queue is attached at all', async () => {
    const res = await request(createApp({ logger, jobs: null })).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.jobs).toBe('down');
  });
});
