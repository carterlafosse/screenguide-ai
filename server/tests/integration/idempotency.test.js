// idempotency.test.js: the idempotent() middleware over HTTP: required UUID key, replay of a finished
// request, 422 on key reuse with a different request, 409 while the first request is in progress,
// 5xx not stored, per-user keys, and reclaiming a stale in-progress key.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { idempotent } from '../../src/middleware/idempotent.js';
import { hashRequest } from '../../src/modules/idempotency/idempotency.service.js';
import { AppError } from '../../src/utils/AppError.js';
import { getSeedIds, withOwnerClient } from '../dbHelpers.js';
import { captureLogger, waitFor } from '../helpers.js';

let ids;
let calls = 0;
let release;
let gate = Promise.resolve();

const { logger } = captureLogger();
const app = createApp({
  logger,
  jobs: null,
  mountRoutes(r) {
    // Stand-in for `authenticate` (Phase 3): the test picks the user with a header.
    const fakeAuth = (req, res, next) => {
      const key = req.get('x-test-user') ?? 'user1';
      req.user = { id: ids.acme.users[key], orgId: ids.acme.id, role: 'end_user' };
      next();
    };
    r.post('/test/things', fakeAuth, idempotent(), async (req, res) => {
      calls += 1;
      const n = calls;
      if (req.body.wait) await gate;
      if (req.body.fail) throw new Error('server bug');
      if (req.body.bad) throw AppError.badRequest('Bad thing');
      res.status(201).json({ n, name: req.body.name });
    });
  },
});

beforeAll(async () => {
  ids = await getSeedIds();
});

const post = (key, body, user = 'user1') => {
  const req = request(app).post('/api/test/things').set('x-test-user', user);
  if (key) req.set('Idempotency-Key', key);
  return req.send(body);
};

describe('idempotent()', () => {
  it('requires an Idempotency-Key header that is a UUID', async () => {
    const missing = await post(null, { name: 'a' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const invalid = await post('abc', { name: 'a' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('IDEMPOTENCY_KEY_INVALID');
  });

  it('replays the stored response for the same key and request; the handler runs once', async () => {
    const key = randomUUID();
    const before = calls;
    const first = await post(key, { name: 'printer', priority: 1 });
    expect(first.status).toBe(201);
    // Same request with keys in a different order is still the same request.
    const replay = await post(key, { priority: 1, name: 'printer' });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(calls - before).toBe(1);

    const stored = await withOwnerClient(
      async (c) =>
        (await c.query('SELECT status, response_code FROM idempotency_keys WHERE key = $1', [key]))
          .rows,
    );
    expect(stored).toEqual([{ status: 'completed', response_code: 201 }]);
  });

  it('same key with a different request → 422 IDEMPOTENCY_KEY_REUSED (handler not run)', async () => {
    const key = randomUUID();
    await post(key, { name: 'one' });
    const before = calls;
    const res = await post(key, { name: 'two' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(calls).toBe(before);
  });

  it('same key while the first request is still running → 409 IN_PROGRESS', async () => {
    const key = randomUUID();
    gate = new Promise((resolve) => {
      release = resolve;
    });
    const before = calls;
    const first = post(key, { name: 'slow', wait: true }).then((r) => r);
    await waitFor(() => calls > before); // the first request is inside the handler

    const second = await post(key, { name: 'slow', wait: true });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('IDEMPOTENCY_REQUEST_IN_PROGRESS');

    release();
    expect((await first).status).toBe(201);
    const replay = await post(key, { name: 'slow', wait: true });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(calls - before).toBe(1);
  });

  it('does not store 5xx responses, so a retry runs the handler again', async () => {
    const key = randomUUID();
    const before = calls;
    expect((await post(key, { name: 'x', fail: true })).status).toBe(500);
    expect((await post(key, { name: 'x', fail: true })).status).toBe(500);
    expect(calls - before).toBe(2);
    const rows = await withOwnerClient(
      async (c) => (await c.query('SELECT 1 FROM idempotency_keys WHERE key = $1', [key])).rowCount,
    );
    expect(rows).toBe(0);
  });

  it('stores and replays 4xx responses like any other result', async () => {
    const key = randomUUID();
    const before = calls;
    const first = await post(key, { name: 'x', bad: true });
    const again = await post(key, { name: 'x', bad: true });
    expect(first.status).toBe(400);
    expect(again.status).toBe(400);
    expect(again.body).toEqual(first.body);
    expect(calls - before).toBe(1);
  });

  it('keys are per user: the same key from another user is a separate request', async () => {
    const key = randomUUID();
    const before = calls;
    expect((await post(key, { name: 'x' }, 'user1')).status).toBe(201);
    expect((await post(key, { name: 'x' }, 'user2')).status).toBe(201);
    expect(calls - before).toBe(2);
  });

  it('reclaims an in-progress key abandoned more than 5 minutes ago', async () => {
    const key = randomUUID();
    const body = { name: 'after-crash' };
    await withOwnerClient((c) =>
      c.query(
        `INSERT INTO idempotency_keys (organization_id, user_id, key, request_hash, status, created_at)
         VALUES ($1, $2, $3, $4, 'in_progress', NOW() - INTERVAL '10 minutes')`,
        [ids.acme.id, ids.acme.users.user1, key, hashRequest('POST', '/api/test/things', body)],
      ),
    );
    const before = calls;
    const res = await post(key, body);
    expect(res.status).toBe(201);
    expect(calls - before).toBe(1);
  });
});
