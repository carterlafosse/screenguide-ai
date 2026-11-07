// crypto.js: AES-256-GCM encryption for secrets stored at rest (integration API keys).
// Stored format: `iv:authTag:ciphertext`, each part base64. Decrypt only where the secret is used
// (the ticket.push worker); never return or log the plaintext.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // recommended nonce size for GCM
const TAG_BYTES = 16;

/**
 * @param {string} base64Key 32 bytes, base64 (ENCRYPTION_KEY)
 * @returns {Buffer}
 */
function keyFrom(base64Key) {
  const key = Buffer.from(base64Key ?? '', 'base64');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (base64)');
  return key;
}

/**
 * Encrypt a UTF-8 string. Every call uses a fresh random IV, so equal inputs give different outputs.
 * @param {string} plaintext
 * @param {string} base64Key
 * @returns {string} `iv:authTag:ciphertext`
 */
export function encrypt(plaintext, base64Key) {
  if (typeof plaintext !== 'string') throw new TypeError('plaintext must be a string');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyFrom(base64Key), iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString('base64')).join(':');
}

/**
 * Decrypt a value from encrypt(). Throws if it was tampered with or the key is wrong.
 * @param {string} payload `iv:authTag:ciphertext`
 * @param {string} base64Key
 * @returns {string}
 */
export function decrypt(payload, base64Key) {
  const parts = typeof payload === 'string' ? payload.split(':') : [];
  if (parts.length !== 3) throw new Error('Malformed encrypted value');
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES)
    throw new Error('Malformed encrypted value');
  const decipher = createDecipheriv(ALGORITHM, keyFrom(base64Key), iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Last 4 characters of a secret, the only part ever shown back to admins.
 * @param {string} secret
 */
export function last4(secret) {
  return typeof secret === 'string' ? secret.slice(-4) : '';
}
