// Command-line runner: resets the database to the seed organizations using MIGRATION_DATABASE_URL.
import '../src/config/loadDotenv.js';
import { USERS } from '../db/seeds/users.js';
import { seed } from './lib/seed.js';

await seed(process.env.MIGRATION_DATABASE_URL)
  .then(() => {
    // Who to sign in as (never the password).
    console.table(
      Object.entries(USERS).flatMap(([org, users]) =>
        Object.values(users).map((u) => ({ org, name: u.name, email: u.email, role: u.role })),
      ),
    );
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
