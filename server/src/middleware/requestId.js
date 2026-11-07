// requestId.js: gives every request an id. Reuses an incoming X-Request-Id when it's a valid UUID
// (so a trace can span services), otherwise generates one. Sets req.id and the response header;
// pino-http logs it on every line.
import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {string | undefined} value */
export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

/** @type {import('express').RequestHandler} */
export function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = isUuid(incoming) ? incoming.toLowerCase() : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
