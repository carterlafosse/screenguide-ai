// loadDotenv.js: loads server/.env into process.env (quietly; dotenv 17+ logs on every load).
// Import this for its side effect before reading process.env. Phase 2's env.js validates the values.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
