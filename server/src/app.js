// app.js: builds the Express application (no listening here, so tests use it directly).
// Middleware order (plan Section 8.1): request id → helmet → cors → pino-http → JSON body (100 kb)
// → cookies → general rate limit on /api → routes → 404 → error handler.
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { pool as defaultPool } from './db/pool.js';
import { docsRouter } from './docs.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { createGeneralLimiter } from './middleware/rateLimits.js';
import { requestId } from './middleware/requestId.js';
import { healthRouter } from './modules/health/health.routes.js';
import { logger as defaultLogger } from './utils/logger.js';

/**
 * @param {{
 *   pool?: import('pg').Pool,
 *   jobs?: { isUp(): Promise<boolean> } | null,
 *   logger?: import('pino').Logger,
 *   mountRoutes?: (router: import('express').Router) => void,
 * }} [deps] Tests inject their own pool, jobs and logger; mountRoutes adds test-only routes under /api.
 * @returns {import('express').Express}
 */
export function createApp({
  pool = defaultPool,
  jobs = null,
  logger = defaultLogger,
  mountRoutes,
} = {}) {
  const app = express();
  app.set('trust proxy', 1); // behind Render's / Vercel's proxy: req.ip is the client's address

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      // Bound on req.log too, so every line logged while handling a request carries the id.
      customProps: (req) => ({ requestId: req.id }),
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', createGeneralLimiter());

  const api = express.Router();
  api.use('/docs', docsRouter());
  api.use(healthRouter({ pool, jobs }));
  mountRoutes?.(api);
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
