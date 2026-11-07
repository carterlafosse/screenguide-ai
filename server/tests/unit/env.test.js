// env.test.js: environment validation (src/config/env.js).
import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '../../src/config/env.js';

const VALID = {
  DATABASE_URL: 'postgres://resolvd_app:pw@localhost:5432/screenguide_dev',
  JWT_SECRET: 'ab'.repeat(48),
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  CLIENT_ORIGIN: 'http://127.0.0.1:5174',
  PUBLIC_WS_URL: 'ws://127.0.0.1:4001/ws',
};

describe('parseEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = parseEnv(VALID);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4001,
      AI_MOCK: false,
      AI_MODEL_FAST: 'claude-haiku-5-5',
      DISABLE_PLAN_LIMITS: false,
    });
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('treats empty optional values as unset and parses booleans', () => {
    const env = parseEnv({ ...VALID, ANTHROPIC_API_KEY: '', AI_MOCK: 'true', PORT: '' });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.AI_MOCK).toBe(true);
    expect(env.PORT).toBe(4001);
  });

  it.each([
    ['DATABASE_URL', undefined],
    ['DATABASE_URL', 'mysql://x@y/z'],
    ['JWT_SECRET', undefined],
    ['JWT_SECRET', 'too-short'],
    ['ENCRYPTION_KEY', Buffer.alloc(16).toString('base64')],
    ['CLIENT_ORIGIN', 'not a url'],
    ['PUBLIC_WS_URL', 'http://127.0.0.1:4001/ws'],
    ['NODE_ENV', 'staging'],
    ['PORT', '99999'],
  ])('rejects %s = %s', (name, value) => {
    expect(() => parseEnv({ ...VALID, [name]: value })).toThrow(EnvError);
    try {
      parseEnv({ ...VALID, [name]: value });
    } catch (err) {
      expect(err.message).toContain(name);
    }
  });

  it('never includes secret values in the error message', () => {
    const secret = 'not-hex-but-very-secret-value';
    try {
      parseEnv({ ...VALID, JWT_SECRET: secret });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.message).toContain('JWT_SECRET');
      expect(err.message).not.toContain(secret);
    }
  });
});
