// rateLimits.js: HTTP rate limiters (express-rate-limit), plan Section 8.5.
//   general  300 / minute per IP on /api
//   login    10 / 15 minutes per IP (Phase 3)
//   register 5 / hour per IP (Phase 3)
//   wsTicket 30 / 5 minutes per signed-in user (Phase 5)
// The default store is in memory, so limits are per instance (see docs/DECISIONS.md).
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

/** Send limit violations through the error handler so they get the standard error shape. */
function handler(req, res, next) {
  next(AppError.tooManyRequests());
}

const common = { standardHeaders: 'draft-8', legacyHeaders: false, handler };

export function createGeneralLimiter() {
  return rateLimit({ ...common, windowMs: 60 * 1000, limit: 300 });
}

export function createLoginLimiter() {
  return rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 10 });
}

export function createRegisterLimiter() {
  return rateLimit({ ...common, windowMs: 60 * 60 * 1000, limit: 5 });
}

/** Keyed by user, so it must run after `authenticate`. */
export function createWsTicketLimiter() {
  return rateLimit({
    ...common,
    windowMs: 5 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => `user:${req.user.id}`,
  });
}
