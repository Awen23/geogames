import path from 'path';
import { config } from 'dotenv';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, asc, eq, gte, isNull, notInArray, or, sql } from 'drizzle-orm';
import { CITY_REVEAL_CITIES } from '@shared/cityRevealCities';
import { questions } from '../data/questions';
import { utcDateString } from '../services/daily';
import { addDays, planPuzzleDays } from '../services/scheduleUtils';
import { puzzleSchedule } from './schema';

config({ path: path.resolve(process.cwd(), '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

/**
 * How many days past today each game is scheduled on every deploy. A newly added puzzle is
 * picked first for the next unscheduled day, so it appears within about this many days. Days
 * past this that a deploy hasn't reached are scheduled on their first request instead.
 */
const DAYS_AHEAD = 14;

/** Every game with a daily schedule, and the ids of the puzzles it can show. */
const SCHEDULED_GAMES: { gameId: string; puzzleIds: string[] }[] = [
  { gameId: 'where-most', puzzleIds: questions.map((question) => question.id) },
  {
    gameId: 'city-reveal',
    puzzleIds: CITY_REVEAL_CITIES.filter((city) => city.implemented === true).map((city) => city.id),
  },
];

type ScheduleDb = PostgresJsDatabase<{ puzzleSchedule: typeof puzzleSchedule }>;

/**
 * Keeps every day from today to DAYS_AHEAD filled for one game. Days from today on whose
 * puzzle has been removed are cleared first, so they get re-planned. Past days are never changed.
 *
 * Runs in a transaction that locks the schedule against writes, so a request scheduling a day
 * on demand can't slip in between the clear, the read and the insert. Reads aren't blocked.
 */
async function scheduleGame(db: ScheduleDb, gameId: string, puzzleIds: string[]): Promise<void> {
  const today = utcDateString();

  if (puzzleIds.length === 0) {
    console.warn(`[${gameId}] No puzzles — skipping`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE ${puzzleSchedule} IN SHARE ROW EXCLUSIVE MODE`);
    await clearAndPlan(tx, gameId, puzzleIds, today);
  });
}

type ScheduleTx = Parameters<Parameters<ScheduleDb['transaction']>[0]>[0];

async function clearAndPlan(db: ScheduleTx, gameId: string, puzzleIds: string[], today: string): Promise<void> {
  const removed = await db
    .delete(puzzleSchedule)
    .where(
      and(
        eq(puzzleSchedule.gameId, gameId),
        gte(puzzleSchedule.date, today),
        or(isNull(puzzleSchedule.puzzleId), notInArray(puzzleSchedule.puzzleId, puzzleIds)),
      ),
    )
    .returning({ date: puzzleSchedule.date });

  const existing = await db
    .select({ date: puzzleSchedule.date, puzzleId: puzzleSchedule.puzzleId })
    .from(puzzleSchedule)
    .where(eq(puzzleSchedule.gameId, gameId))
    .orderBy(asc(puzzleSchedule.date));

  const scheduled = existing.flatMap((day) => (day.puzzleId ? [{ date: day.date, puzzleId: day.puzzleId }] : []));
  const planned = planPuzzleDays(scheduled, puzzleIds, today, DAYS_AHEAD, Math.random);

  if (planned.length > 0) {
    await db
      .insert(puzzleSchedule)
      .values(planned.map((day) => ({ gameId, date: day.date, puzzleId: day.puzzleId })))
      .onConflictDoNothing();
  }

  console.log(
    `[${gameId}] Cleared ${removed.length} days from today on with removed puzzles; ` +
      `scheduled ${planned.length} new days through ${addDays(today, DAYS_AHEAD)} (pool=${puzzleIds.length}).`,
  );
}

export async function runPuzzleSchedule(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema: { puzzleSchedule } });

  try {
    for (const { gameId, puzzleIds } of SCHEDULED_GAMES) {
      await scheduleGame(db, gameId, puzzleIds);
    }
  } finally {
    await client.end();
  }
}

runPuzzleSchedule(DATABASE_URL).catch((err) => {
  console.error('Puzzle schedule failed:', err);
  process.exit(1);
});
