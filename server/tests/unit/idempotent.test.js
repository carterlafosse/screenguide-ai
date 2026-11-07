// idempotent.test.js: the rule deciding which responses idempotent() stores for replay.
import { describe, expect, it } from 'vitest';
import { shouldStoreResponse } from '../../src/middleware/idempotent.js';

const errorBody = (code) => ({ error: { code, message: 'x' } });

describe('shouldStoreResponse', () => {
  it.each([
    [200, { ok: true }],
    [201, { id: 1 }],
    [400, errorBody('BAD_REQUEST')],
    [404, errorBody('NOT_FOUND')],
    [409, errorBody('CONFLICT')],
    [422, errorBody('UNPROCESSABLE')],
  ])('stores %i', (status, body) => {
    expect(shouldStoreResponse(status, body)).toBe(true);
  });

  it.each([
    [400, errorBody('VALIDATION_ERROR')],
    [401, errorBody('UNAUTHORIZED')],
    [403, errorBody('FORBIDDEN')],
    [429, errorBody('RATE_LIMITED')],
    [500, errorBody('INTERNAL_ERROR')],
    [503, errorBody('SERVICE_UNAVAILABLE')],
  ])('releases %i %o', (status, body) => {
    expect(shouldStoreResponse(status, body)).toBe(false);
  });
});
