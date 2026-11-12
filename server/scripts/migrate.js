// Command-line runner: applies pending migrations using MIGRATION_DATABASE_URL (the owner role).
import '../src/config/loadDotenv.js';
import { migrate } from './lib/migrate.js';

await migrate(process.env.MIGRATION_DATABASE_URL, { log: console.log })
  .then((applied) =>
    console.log(
      applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.',
    ),
  )
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
