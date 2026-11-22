/**
 * Recreates the e2e database from scratch: drop, create, migrate, schedule the known puzzles for
 * today, then let the normal schedule script fill the days after it.
 *
 * playwright.config.ts runs this just before it starts the e2e api server, with DATABASE_URL set to
 * the e2e database. To protect other databases, it refuses any name that doesn't end in `_e2e`.
 */
import { execSync } from 'child_process';
import postgres from 'postgres';
import { IMPLEMENTED_CITIES } from '../../shared/cityRevealCities';
import { questions } from '../../api/src/data/questions';
import { utcDateString } from '../../api/src/services/daily';
import { MAPLE_CITY_ID, MOSTLE } from './knownPuzzles';

function indexOf(items: { id: string }[], id: string, what: string): number {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    throw new Error(`${what} "${id}" not found`);
  }
  return index;
}

function assertE2eName(name: string) {
  if (!name.endsWith('_e2e')) {
    throw new Error(`Refusing to reset "${name}": the e2e database name must end in _e2e`);
  }
}

/** Runs one of the api's own npm scripts against the e2e database. */
function runApiScript(script: string, databaseUrl: string) {
  execSync(`npm run ${script} --prefix api`, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function resetDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set (playwright.config.ts sets it to the e2e database)');
  }
  const databaseUrl = new URL(process.env.DATABASE_URL);
  // postgres.js would connect to a `?database=` parameter instead of the path.
  if (databaseUrl.searchParams.has('database')) {
    throw new Error('Refusing to reset: name the e2e database in the URL path, not a ?database= parameter');
  }
  const name = decodeURIComponent(databaseUrl.pathname.slice(1));
  assertE2eName(name);

  // Drop and create from the server's maintenance database.
  const serverUrl = new URL(databaseUrl);
  serverUrl.pathname = '/postgres';
  const server = postgres(serverUrl.href, { max: 1, onnotice: () => {} });
  try {
    await server`DROP DATABASE IF EXISTS ${server(name)} WITH (FORCE)`;
    await server`CREATE DATABASE ${server(name)}`;
  } finally {
    await server.end();
  }

  const db = postgres(databaseUrl.href, { max: 1 });
  try {
    // Belt and braces: check where this URL really connects before writing anything.
    const [{ current_database: connected }] = await db<{ current_database: string }[]>`SELECT current_database()`;
    assertE2eName(connected);

    runApiScript('db:migrate', databaseUrl.href);

    const today = utcDateString();
    await db`INSERT INTO puzzle_schedule ${db([
      { game_id: 'where-most', date: today, puzzle_index: indexOf(questions, MOSTLE.questionId, 'Mostle question') },
      { game_id: 'city-reveal', date: today, puzzle_index: indexOf(IMPLEMENTED_CITIES, MAPLE_CITY_ID, 'Maple city') },
    ])}`;
    console.log(`[e2e] ${connected}: today (${today}) is Mostle "${MOSTLE.questionId}" and Maple "${MAPLE_CITY_ID}".`);
  } finally {
    await db.end();
  }

  runApiScript('db:schedule', databaseUrl.href);
}

resetDb().catch((err) => {
  console.error('e2e database reset failed:', err);
  process.exit(1);
});
