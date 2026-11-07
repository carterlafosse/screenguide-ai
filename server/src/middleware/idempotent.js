// idempotent.js: Idempotency-Key middleware for unsafe POSTs (plan Section 8.4). Use after
// authenticate (it needs req.user) and validate:
//   router.post('/sessions', authenticate, validate(...), idempotent(), controller.create)
// - Missing or non-UUID key → 400.
// - Same key + same request, finished → the stored status and JSON body are replayed
//   (header Idempotent-Replayed: true); the handler does not run again.
// - Same key + different request → 422 IDEMPOTENCY_KEY_REUSED.
// - Same key while the first request is still running → 409 IDEMPOTENCY_REQUEST_IN_PROGRESS.
// - Stored and replayed: 2xx and business-logic 4xx (e.g. 400 BAD_REQUEST, 404, 409, 422).
// - Not stored (the key is released, so a retry with the same key runs fresh): 5xx, 400
//   VALIDATION_ERROR, 401, 403 and 429. These describe the request's circumstances (bad input,
//   auth, rate limit, server trouble) rather than an outcome worth replaying.
// Handlers behind this middleware must answer with res.json().
import { AppError } from '../utils/AppError.js';
import { isUuid } from './requestId.js';
import {
  abandonRequest,
  beginRequest,
  completeRequest,
  hashRequest,
} from '../modules/idempotency/idempotency.service.js';

const RELEASED_STATUSES = new Set([401, 403, 429]);

/**
 * Whether a response should be stored for replay (true) or the key released instead (false).
 * @param {number} status
 * @param {any} body
 */
export function shouldStoreResponse(status, body) {
  if (status >= 500) return false;
  if (RELEASED_STATUSES.has(status)) return false;
  if (status === 400 && body?.error?.code === 'VALIDATION_ERROR') return false;
  return true;
}

export function idempotent() {
  /** @type {import('express').RequestHandler} */
  return async function idempotentMiddleware(req, res, next) {
    const key = req.get('Idempotency-Key');
    if (!key) {
      throw AppError.badRequest(
        'This request needs an Idempotency-Key header',
        undefined,
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    }
    if (!isUuid(key)) {
      throw AppError.badRequest(
        'Idempotency-Key must be a UUID',
        undefined,
        'IDEMPOTENCY_KEY_INVALID',
      );
    }
    if (!req.user) throw AppError.unauthorized();

    const ids = { orgId: req.user.orgId, userId: req.user.id, key: key.toLowerCase() };
    const requestHash = hashRequest(req.method, req.originalUrl, req.body);
    const outcome = await beginRequest({ ...ids, requestHash });

    if (outcome.state === 'mismatch') {
      throw AppError.unprocessable(
        'This Idempotency-Key was already used for a different request',
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
    if (outcome.state === 'in_progress') {
      throw AppError.conflict(
        'A request with this Idempotency-Key is still being processed',
        'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      );
    }
    if (outcome.state === 'completed') {
      res.set('Idempotent-Replayed', 'true');
      res.status(outcome.responseCode).json(outcome.responseBody);
      return;
    }

    // New request: store whatever JSON response it produces before sending it.
    const sendJson = res.json.bind(res);
    let settled = false;
    res.json = (body) => {
      if (settled) return sendJson(body);
      settled = true;
      const status = res.statusCode;
      const store = shouldStoreResponse(status, body)
        ? completeRequest({ ...ids, responseCode: status, responseBody: body })
        : abandonRequest(ids);
      store
        .catch((err) => req.log?.error({ err }, 'could not store idempotent response'))
        .finally(() => sendJson(body));
      return res;
    };
    // Finished without res.json (or the client went away first): free the key for a retry.
    res.on('close', () => {
      if (settled) return;
      settled = true;
      abandonRequest(ids).catch((err) =>
        req.log?.error({ err }, 'could not release idempotency key'),
      );
    });
    next();
  };
}
