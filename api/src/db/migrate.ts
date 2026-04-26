import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const MIGRATION_DATABASE_URL = DATABASE_URL;
const MAX_MIGRATION_ATTEMPTS = 8;
const MIGRATION_RETRY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postgresErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }

  if ('code' in err && typeof err.code === 'string') {
    return err.code;
  }

  if ('cause' in err) {
    return postgresErrorCode(err.cause);
  }

  return undefined;
}

function isTransientMigrationError(err: unknown): boolean {
  const code = postgresErrorCode(err);
  return (
    code?.startsWith('08') ||
    code === '57P03' ||
    code === '57P02' ||
    code === '57P01' ||
    code === '53300' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN'
  );
}

async function runMigrations() {
  for (let attempt = 1; attempt <= MAX_MIGRATION_ATTEMPTS; attempt++) {
    const migrationClient = postgres(MIGRATION_DATABASE_URL, { max: 1 });
    const db = drizzle(migrationClient);

    try {
      console.log(`Running migrations... attempt ${attempt}/${MAX_MIGRATION_ATTEMPTS}`);
      await migrate(db, {
        migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
      });
      console.log('Migrations complete.');
      return;
    } catch (err) {
      if (!isTransientMigrationError(err) || attempt === MAX_MIGRATION_ATTEMPTS) {
        throw err;
      }

      console.warn(`Migration database unavailable; retrying in ${MIGRATION_RETRY_MS / 1000}s...`);
      await sleep(MIGRATION_RETRY_MS);
    } finally {
      await migrationClient.end();
    }
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
