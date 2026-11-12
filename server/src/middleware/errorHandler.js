// errorHandler.js: the last middleware. Turns any error into `{ error: { code, message, details? } }`
// (same rules as Resolvd): AppError → its own status; ZodError → 400 VALIDATION_ERROR with the
// flattened issues; PostgreSQL 23505 → 409, 23503/22P02 → 400; body-parser errors → 400/413/415;
// anything else is logged with the request id and answered with a generic 500 (no internals leak).
import { ZodError, z } from 'zod';
import { AppError } from '../utils/AppError.js';

/** PostgreSQL SQLSTATE codes we translate (https://www.postgresql.org/docs/current/errcodes-appendix.html). */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_INVALID_TEXT_REPRESENTATION = '22P02';

/**
 * Map any thrown value to an AppError (or null if it's unexpected).
 * @param {any} err
 * @returns {AppError | null}
 */
export function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    // { formErrors: string[], fieldErrors: { [field]: string[] } }: Resolvd's details shape.
    return AppError.validation(z.flattenError(err));
  }
  if (err?.code === PG_UNIQUE_VIOLATION) {
    return AppError.conflict('That already exists', 'CONFLICT');
  }
  if (err?.code === PG_FOREIGN_KEY_VIOLATION) {
    return AppError.badRequest('A referenced item does not exist', undefined, 'INVALID_REFERENCE');
  }
  if (err?.code === PG_INVALID_TEXT_REPRESENTATION) {
    return AppError.badRequest('Invalid input', undefined, 'INVALID_INPUT');
  }
  // body-parser (express.json) errors carry `type` and `status`.
  if (err?.type === 'entity.parse.failed') {
    return AppError.badRequest('The request body is not valid JSON', undefined, 'INVALID_JSON');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large');
  }
  if (err?.type === 'encoding.unsupported' || err?.type === 'charset.unsupported') {
    return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported request encoding');
  }
  return null;
}

/**
 * Express treats a middleware as an error handler only when it declares 4 arguments.
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, req, res, _next) {
  let appError = toAppError(err);
  if (!appError) {
    req.log?.error({ err }, 'unhandled error');
    appError = AppError.internal();
  } else if (appError.status >= 500) {
    req.log?.error({ err }, appError.message);
  }

  if (res.headersSent) {
    // Too late to send an error body; let Express close the connection.
    res.end();
    return;
  }

  const body = { code: appError.code, message: appError.message };
  if (appError.details !== undefined) body.details = appError.details;
  res.status(appError.status).json({ error: body });
}
