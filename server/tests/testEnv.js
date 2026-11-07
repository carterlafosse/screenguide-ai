// testEnv.js: works out the test database URLs. Tests always use the screenguide_test database,
// derived from DATABASE_URL / MIGRATION_DATABASE_URL by swapping the database name, so running
// `npm test` with a dev .env can never touch screenguide_dev.

export const TEST_DATABASE_NAME = 'screenguide_test';

/**
 * @param {string | undefined} url
 * @param {string} name env var name, for the error message
 */
function toTestUrl(url, name) {
  if (!url) {
    throw new Error(
      `${name} is not set. Create server/.env from server/.env.example (tests use the ${TEST_DATABASE_NAME} database on the same server).`,
    );
  }
  const parsed = new URL(url);
  parsed.pathname = `/${TEST_DATABASE_NAME}`;
  return parsed.toString();
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ app: string, owner: string }}
 */
export function testDatabaseUrls(env) {
  return {
    app: toTestUrl(env.DATABASE_URL, 'DATABASE_URL'),
    owner: toTestUrl(env.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL'),
  };
}

/**
 * Throws unless the URL points at a database whose name ends in _test.
 * @param {string} url
 */
export function assertTestDatabase(url) {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${dbName}": tests only run against a *_test database.`);
  }
}
