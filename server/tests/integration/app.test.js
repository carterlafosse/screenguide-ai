// app.test.js: the Express foundation end to end: error translation (AppError, PostgreSQL 23505 →
// 409, 23503 → 400, unknown → 500), body parsing limits, validate(), 404s, request ids on responses
// and on every log line, log redaction, CORS, security headers and the API docs.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { withOrg, withTransaction } from '../../src/db/withOrg.js';
import { validate } from '../../src/middleware/validate.js';
import { AppError } from '../../src/utils/AppError.js';
import { getSeedIds } from '../dbHelpers.js';
import { captureLogger } from '../helpers.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let ids;
const { logger, lines } = captureLogger();

const app = createApp({
  logger,
  jobs: null,
  mountRoutes(r) {
    r.get('/test/app-error', () => {
      throw AppError.forbidden('Admins only');
    });
    r.get('/test/app-error-details', () => {
      throw AppError.validation([{ path: 'email', message: 'Required' }]);
    });
    r.get('/test/unique', async () => {
      // 'acme-corp' is a seeded slug, so the definer function hits the UNIQUE constraint (23505).
      await withTransaction((c) => c.query("SELECT create_organization('Dup', 'acme-corp')"));
    });
    r.get('/test/fk', async () => {
      await withOrg(ids.acme.id, (c) =>
        c.query('INSERT INTO assist_sessions (organization_id, user_id) VALUES ($1, 999999)', [
          ids.acme.id,
        ]),
      );
    });
    r.get('/test/boom', async () => {
      throw new Error('internal detail: connection string postgres://secret');
    });
    r.get('/test/zod', async () => {
      // A ZodError thrown anywhere in a request (not only from validate()) becomes a 400.
      z.object({ email: z.email() }).parse({ email: 'not-an-email' });
    });
    r.get('/test/bad-int', async () => {
      // '22P02' invalid text representation, e.g. a non-numeric id reaching an INT column.
      await withOrg(ids.acme.id, (c) => c.query("SELECT 'abc'::int"));
    });
    r.post(
      '/test/echo',
      validate({
        body: z.object({ name: z.string().min(1) }),
        query: z.object({ n: z.coerce.number().int() }),
      }),
      (req, res) => res.json({ body: req.body, query: req.validatedQuery }),
    );
    r.get(
      '/test/items/:id',
      validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
      (req, res) => res.json({ id: req.params.id, type: typeof req.params.id }),
    );
    r.get('/test/log', (req, res) => {
      req.log.info(
        { user: { password: 'hunter2' }, turn: { frame: 'BASE64JPEG' }, apiKey: 'sk-live' },
        'handler log',
      );
      res.json({ ok: true });
    });
  },
});

beforeAll(async () => {
  ids = await getSeedIds();
});

describe('error translation', () => {
  it('AppError → its status and { error: { code, message } }', async () => {
    const res = await request(app).get('/api/test/app-error');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Admins only' } });
  });

  it('includes details when the AppError has them', async () => {
    const res = await request(app).get('/api/test/app-error-details');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'email', message: 'Required' }],
    });
  });

  it('PostgreSQL unique violation (23505) → 409 CONFLICT', async () => {
    const res = await request(app).get('/api/test/unique');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('PostgreSQL foreign key violation (23503) → 400 INVALID_REFERENCE', async () => {
    const res = await request(app).get('/api/test/fk');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('unknown errors → generic 500, logged with the request id, internals not leaked', async () => {
    const res = await request(app).get('/api/test/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
    const logged = lines.find(
      (l) => l.msg === 'unhandled error' && l.requestId === res.headers['x-request-id'],
    );
    expect(logged?.err?.message).toContain('internal detail');
  });

  it('malformed JSON → 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/test/echo?n=1')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('bodies over 100 kb → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/api/test/echo?n=1')
      .send({ name: 'x'.repeat(101 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('unknown routes → 404 NOT_FOUND (same code as Resolvd)', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'No route for GET /api/nope' });
  });

  it('any ZodError → 400 VALIDATION_ERROR with flattened details (Resolvd shape)', async () => {
    const res = await request(app).get('/api/test/zod');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual({
      formErrors: [],
      fieldErrors: { email: [expect.any(String)] },
    });
  });

  it('PostgreSQL invalid text representation (22P02) → 400 INVALID_INPUT', async () => {
    const res = await request(app).get('/api/test/bad-int');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'INVALID_INPUT', message: 'Invalid input' });
  });
});

describe('validate()', () => {
  it('rejects invalid input: 400 VALIDATION_ERROR with { formErrors, fieldErrors }', async () => {
    const res = await request(app).post('/api/test/echo?n=5').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual({
      formErrors: [],
      fieldErrors: { name: [expect.any(String)] },
    });
  });

  it('checks params, then query, then body, and reports the first part that fails', async () => {
    const res = await request(app).post('/api/test/echo?n=abc').send({ name: '' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(['n']);
  });

  it('passes parsed values on: body, coerced params, and query on req.validatedQuery', async () => {
    const echo = await request(app).post('/api/test/echo?n=5').send({ name: 'Dana', extra: 1 });
    expect(echo.status).toBe(200);
    expect(echo.body).toEqual({ body: { name: 'Dana' }, query: { n: 5 } });

    const item = await request(app).get('/api/test/items/42');
    expect(item.body).toEqual({ id: 42, type: 'number' });
  });
});

describe('request ids and logging', () => {
  it('generates a UUID request id and returns it in X-Request-Id', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('reuses a valid incoming X-Request-Id and replaces an invalid one', async () => {
    const incoming = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const kept = await request(app).get('/api/health').set('X-Request-Id', incoming);
    expect(kept.headers['x-request-id']).toBe(incoming);
    const replaced = await request(app)
      .get('/api/health')
      .set('X-Request-Id', 'not-a-uuid; drop table');
    expect(replaced.headers['x-request-id']).toMatch(UUID);
    expect(replaced.headers['x-request-id']).not.toContain('drop');
  });

  it('every log line written while handling a request carries its request id', async () => {
    const before = lines.length;
    const res = await request(app).get('/api/test/log');
    const id = res.headers['x-request-id'];
    const newLines = lines.slice(before);
    expect(newLines.length).toBeGreaterThanOrEqual(2); // handler log + request completed
    for (const line of newLines) expect(line.requestId).toBe(id);
  });

  it('redacts passwords, frames, API keys and cookies from logs', async () => {
    const before = lines.length;
    await request(app).get('/api/test/log').set('Cookie', 'resolvd_token=abc.def.ghi');
    const text = JSON.stringify(lines.slice(before));
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('BASE64JPEG');
    expect(text).not.toContain('sk-live');
    expect(text).not.toContain('abc.def.ghi');
    expect(text).toContain('[REDACTED]');
  });
});

describe('security headers, CORS and docs', () => {
  it('sets helmet headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows the configured client origin with credentials, and no other origin', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://127.0.0.1:5174');
    expect(ok.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5174');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const other = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it('serves Swagger UI at /api/docs and the OpenAPI document as JSON', async () => {
    const html = await request(app).get('/api/docs/');
    expect(html.status).toBe(200);
    expect(html.text).toContain('swagger-ui');
    const doc = await request(app).get('/api/docs/openapi.json');
    expect(doc.body.openapi).toBe('3.0.3');
    expect(Object.keys(doc.body.paths)).toEqual(expect.arrayContaining(['/health', '/ready']));
  });

  it('applies the general rate limiter to /api (standard RateLimit headers)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['ratelimit-policy']).toContain('300');
  });
});
