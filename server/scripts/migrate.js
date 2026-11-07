// migrate.js: applies numbered .sql files from db/migrations in order, each in its own transaction
// (BEGIN → file SQL → record filename in schema_migrations → COMMIT, ROLLBACK on error).
// Run as resolvd_owner: `npm run migrate` uses MIGRATION_DATABASE_URL. Also exported for tests.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'pg';

const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
// Any fixed number works; it only has to be the same for every migrate run.
const ADVISORY_LOCK_KEY = 4001_100;

/**
 * List migration filenames in apply order (numeric prefix, then name).
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function listMigrationFiles(dir = DEFAULT_DIR) {
  const entries = await readdir(dir);
  return entries.filter((name) => MIGRATION_FILE.test(name)).sort();
}

/**
 * Apply every migration that hasn't been applied yet.
 * @param {string} connectionString owner connection (MIGRATION_DATABASE_URL)
 * @param {{ dir?: string, log?: (message: string) => void }} [options]
 * @returns {Promise<string[]>} filenames applied in this run
 */
export async function migrate(connectionString, { dir = DEFAULT_DIR, log = () => {} } = {}) {
  if (!connectionString) throw new Error('migrate: a connection string is required');

  const client = new Client({ connectionString });
  await client.connect();
  const applied = [];

  try {
    const { rows: who } = await client.query('SELECT current_user AS name');
    if (who[0].name === 'resolvd_app') {
      throw new Error(
        'migrate: refusing to run as resolvd_app; use MIGRATION_DATABASE_URL (owner)',
      );
    }

    // One migrate run at a time per database (e.g. two deploys starting together).
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const done = new Set(rows.map((r) => r.filename));
    const files = await listMigrationFiles(dir);

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        err.message = `Migration ${file} failed: ${err.message}`;
        throw err;
      }
      applied.push(file);
      log(`applied ${file}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock_all()').catch(() => {});
    await client.end();
  }

  return applied;
}

// ----- CLI -----
const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  await import('../src/config/loadDotenv.js');
  try {
    const applied = await migrate(process.env.MIGRATION_DATABASE_URL, {
      log: (message) => console.log(message),
    });
    console.log(
      applied.length ? `Done: ${applied.length} migration(s) applied.` : 'Already up to date.',
    );
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
