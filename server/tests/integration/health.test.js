// health.test.js: smoke test that the app builds and the liveness route answers.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
