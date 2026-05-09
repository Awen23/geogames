import path from 'path';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, asc } from 'drizzle-orm';
import { CITY_REVEAL_CITIES } from '@shared/cityRevealCities';
import { questions } from '../data/questions';
import { utcDateString } from '../services/daily';
import { unscheduledIndices } from '../services/scheduleUtils';
import { puzzleSchedule } from './schema';

config({ path: path.resolve(process.cwd(), '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const IMPLEMENTED_CITIES = CITY_REVEAL_CITIES.filter((c) => c.implemented === true);

const GAME_POOLS: Record<string, () => number> = {
  'where-most': () => questions.length,
  'city-reveal': () => IMPLEMENTED_CITIES.length,
};

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function maxDate(a: string, b: string): string {
  return a.localeCompare(b) >= 0 ? a : b;
}

export async function runPuzzleSchedule(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema: { puzzleSchedule } });

  try {
    for (const [gameId, getPoolSize] of Object.entries(GAME_POOLS)) {
      const poolSize = getPoolSize();
      if (poolSize === 0) {
        console.warn(`[${gameId}] Pool is empty — skipping`);
        continue;
      }

      const existing = await db
        .select({ date: puzzleSchedule.date, puzzleIndex: puzzleSchedule.puzzleIndex })
        .from(puzzleSchedule)
        .where(eq(puzzleSchedule.gameId, gameId))
        .orderBy(asc(puzzleSchedule.date));

      const today = utcDateString();
      const lastScheduledDate = existing.length > 0 ? existing[existing.length - 1].date : null;
      const nextAfterLast = lastScheduledDate ? addDays(lastScheduledDate, 1) : today;
      const startDate = maxDate(today, nextAfterLast);

      const unseen = unscheduledIndices(existing, poolSize);

      if (unseen.length === 0) {
        console.log(`[${gameId}] All ${poolSize} puzzles scheduled once — add more content, then redeploy.`);
        continue;
      }

      const toSchedule = shuffle(unseen);
      const rows = toSchedule.map((puzzleIndex, i) => ({
        gameId,
        date: addDays(startDate, i),
        puzzleIndex,
      }));

      await db.insert(puzzleSchedule).values(rows).onConflictDoNothing();
      console.log(`[${gameId}] Scheduled ${rows.length} new days (pool=${poolSize}, unseen=${unseen.length}).`);
    }
  } finally {
    await client.end();
  }
}

runPuzzleSchedule(DATABASE_URL).catch((err) => {
  console.error('Puzzle schedule failed:', err);
  process.exit(1);
});
