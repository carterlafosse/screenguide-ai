// crypto.test.js: AES-256-GCM helpers for secrets at rest.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, last4 } from '../../src/utils/crypto.js';

const KEY = randomBytes(32).toString('base64');

describe('encrypt / decrypt', () => {
  it('round-trips a value', () => {
    const secret = 'rsv_ab12cd_s3cr3t-value-ünïcødé';
    expect(decrypt(encrypt(secret, KEY), KEY)).toBe(secret);
  });

  it('round-trips an empty string', () => {
    expect(decrypt(encrypt('', KEY), KEY)).toBe('');
  });

  it('stores iv:authTag:ciphertext and never the plaintext', () => {
    const payload = encrypt('my-api-key', KEY);
    const parts = payload.split(':');
    expect(parts).toHaveLength(3);
    expect(Buffer.from(parts[0], 'base64')).toHaveLength(12);
    expect(Buffer.from(parts[1], 'base64')).toHaveLength(16);
    expect(payload).not.toContain('my-api-key');
  });

  it('uses a fresh IV every time (same input, different output)', () => {
    expect(encrypt('same', KEY)).not.toBe(encrypt('same', KEY));
  });

  it('rejects a tampered ciphertext', () => {
    const [iv, tag, ct] = encrypt('my-api-key', KEY).split(':');
    const bytes = Buffer.from(ct, 'base64');
    bytes[0] ^= 0xff;
    expect(() => decrypt([iv, tag, bytes.toString('base64')].join(':'), KEY)).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    const [iv, tag, ct] = encrypt('my-api-key', KEY).split(':');
    const bytes = Buffer.from(tag, 'base64');
    bytes[0] ^= 0xff;
    expect(() => decrypt([iv, bytes.toString('base64'), ct].join(':'), KEY)).toThrow();
  });

  it('fails with the wrong key', () => {
    const other = randomBytes(32).toString('base64');
    expect(() => decrypt(encrypt('my-api-key', KEY), other)).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => encrypt('x', randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(() => encrypt('x', undefined)).toThrow(/32 bytes/);
  });

  it('rejects malformed payloads', () => {
    expect(() => decrypt('not-encrypted', KEY)).toThrow(/Malformed/);
    expect(() => decrypt('a:b:c', KEY)).toThrow(/Malformed/);
  });
});

describe('last4', () => {
  it('returns only the last four characters', () => {
    expect(last4('rsv_abc_123456789')).toBe('6789');
  });
});
