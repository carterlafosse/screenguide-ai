// app.js: builds the Express application (no listening here, so tests can use it directly).
// Phase 0 placeholder: only the liveness route. Phase 2 adds the full middleware
// stack (request IDs, helmet, cors, pino-http, rate limits, error handler, docs).
import express from 'express';

/**
 * Create the Express app.
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  // Liveness: no database access (see plan Section 8.7).
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
