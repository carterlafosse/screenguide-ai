// jobs.test.js: pg-boss running as resolvd_app with migrations off: start, process a job, enqueue
// inside a transaction (rolled back → no job; committed → job), payload envelope rules, retries,
// readiness, and stop.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { withOrg, withTransaction } from '../../src/db/withOrg.js';
import { createJobs } from '../../src/jobs/index.js';
import { QUEUES } from '../../src/jobs/queues.js';
import { getSeedIds } from '../dbHelpers.js';
import { captureLogger, sleep, waitFor } from '../helpers.js';

const { logger, lines } = captureLogger();
/** @type {any[]} */
const received = [];
const failOnce = new Set();

let ids;
const jobs = createJobs({
  connectionString: process.env.DATABASE_URL,
  logger,
  workOptions: { pollingIntervalSeconds: 0.5 },
  workers: {
    [QUEUES.NOOP]: async (job, { logger: log }) => {
      if (failOnce.delete(job.data.marker)) throw new Error('first attempt fails');
      received.push(job.data);
      log.info('test worker ran');
    },
  },
});

beforeAll(async () => {
  ids = await getSeedIds();
  await jobs.start();
});

afterAll(async () => {
  await jobs.stop({ timeout: 2000 });
});

const envelope = () => ({ orgId: ids.acme.id, requestId: randomUUID() });
const receivedMarker = (marker) => received.find((d) => d.marker === marker);

describe('job queue (pg-boss as resolvd_app)', () => {
  it('starts with migrations off and reports up', async () => {
    expect(await jobs.isUp()).toBe(true);
  });

  it('processes a job; the worker logger carries queue, job id, org id and request id', async () => {
    const data = { ...envelope(), marker: randomUUID() };
    const jobId = await jobs.send(QUEUES.NOOP, data);
    await waitFor(() => receivedMarker(data.marker));
    const line = lines.find((l) => l.msg === 'test worker ran' && l.jobId === jobId);
    expect(line).toMatchObject({
      queue: QUEUES.NOOP,
      orgId: ids.acme.id,
      requestId: data.requestId,
    });
  });

  it('a job enqueued in a transaction that rolls back never exists', async () => {
    const data = { ...envelope(), marker: randomUUID() };
    let jobId;
    await expect(
      withOrg(ids.acme.id, async (client) => {
        jobId = await jobs.send(QUEUES.NOOP, data, { client });
        throw new Error('data change failed');
      }),
    ).rejects.toThrow('data change failed');
    expect(jobId).toBeTruthy();
    expect(await jobs.boss.findJobs(QUEUES.NOOP, { id: jobId })).toEqual([]);
    await sleep(1500); // longer than the polling interval
    expect(receivedMarker(data.marker)).toBeUndefined();
  });

  it('a job enqueued in a transaction that commits is processed', async () => {
    const data = { ...envelope(), marker: randomUUID() };
    await withTransaction((client) => jobs.send(QUEUES.NOOP, data, { client }));
    await waitFor(() => receivedMarker(data.marker));
  });

  it('retries a failed job (queue retry policy)', async () => {
    const data = { ...envelope(), marker: randomUUID() };
    failOnce.add(data.marker);
    await jobs.send(QUEUES.NOOP, data);
    await waitFor(() => receivedMarker(data.marker), { timeoutMs: 15000 });
    expect(lines.some((l) => l.msg === 'job failed' && l.requestId === data.requestId)).toBe(true);
  }, 20000);

  it('requires orgId and requestId on every payload, and a known queue', async () => {
    await expect(jobs.send(QUEUES.NOOP, { requestId: randomUUID() })).rejects.toThrow();
    await expect(jobs.send(QUEUES.NOOP, { orgId: ids.acme.id })).rejects.toThrow();
    await expect(jobs.send('no.such.queue', envelope())).rejects.toThrow(/Unknown queue/);
  });

  it('/api/ready reports jobs up with the real queue, and down after stop', async () => {
    const app = createApp({ logger, jobs });
    const up = await request(app).get('/api/ready');
    expect(up.status).toBe(200);
    expect(up.body).toEqual({ status: 'ok', database: 'up', jobs: 'up' });

    await jobs.stop({ timeout: 2000 });
    expect(await jobs.isUp()).toBe(false);
    const down = await request(app).get('/api/ready');
    expect(down.status).toBe(503);
    expect(down.body.jobs).toBe('down');
  });
});
