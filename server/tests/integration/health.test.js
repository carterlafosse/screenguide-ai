// health.test.js: /api/health has Resolvd's contract (database check: 200 ok/up or 503
// degraded/down). /api/ready, ScreenGuide's addition, also checks the job queue.
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

describe('GET /api/health (Resolvd contract)', () => {
  it('200 { status: ok, database: up } when the database answers', async () => {
    const res = await request(createApp({ logger, jobs: jobsDown })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('503 { status: degraded, database: down } when Postgres is unreachable', async () => {
    const res = await request(createApp({ logger, pool: deadPool, jobs: jobsUp })).get(
      '/api/health',
    );
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'down' });
  });
});

describe('GET /api/ready', () => {
  it('200 when the database and jobs are up', async () => {
    const res = await request(createApp({ logger, jobs: jobsUp })).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', jobs: 'up' });
  });

  it('503 degraded with database: down when Postgres is unreachable', async () => {
    const res = await request(createApp({ logger, pool: deadPool, jobs: jobsUp })).get(
      '/api/ready',
    );
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'down', jobs: 'up' });
  });

  it('503 degraded with jobs: down when the job queue is not running', async () => {
    const res = await request(createApp({ logger, jobs: jobsDown })).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'up', jobs: 'down' });
  });

  it('503 when no job queue is attached at all', async () => {
    const res = await request(createApp({ logger, jobs: null })).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.jobs).toBe('down');
  });
});
