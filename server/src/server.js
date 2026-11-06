// server.js: starts the HTTP server for local development and production.
// Phase 0 placeholder: Phase 2 replaces the env handling with src/config/env.js (Zod)
// and adds pg-boss, the WebSocket server and full graceful shutdown.
import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 4001;
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

const server = createApp().listen(port, host, () => {
  console.log(`ScreenGuide API listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
