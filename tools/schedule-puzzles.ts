/**
 * Generates the puzzle schedule for Where Most and City Reveal.
 *
 * Run after every puzzle batch addition: tsx tools/schedule-puzzles.ts
 *
 * Strategy:
 *   - Cycles through all puzzles in shuffled order, no repeats within a cycle.
 *   - Stops scheduling when the current cycle is exhausted.
 *   - If a day arrives with no scheduled row (gap before new puzzles arrive),
 *     the server falls back to "least-recently-shown" (see puzzleSchedule.ts).
 *   - Safe to run repeatedly — inserts only, never updates existing rows.
 */
import path from 'path';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, asc } from 'drizzle-orm';
import { puzzleSchedule } from '../api/src/db/schema';
import { unseenInCurrentCycle } from '../api/src/services/cycleUtils';

config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// ── Pool sizes ─────────────────────────────────────────────────────────────

// Inline the pool-size logic rather than importing server code directly,
// to avoid pulling in Express/env side-effects.

function getWhereMostPoolSize(): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { questions } = require('../api/src/data/questions');
  return (questions as unknown[]).length;
}

function getCityRevealPoolSize(): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CITY_REVEAL_CITIES } = require('../shared/cityRevealCities');
  return (CITY_REVEAL_CITIES as { implemented?: boolean }[]).filter((c) => c.implemented === true).length;
}

const GAME_POOLS: Record<string, () => number> = {
  'where-most': getWhereMostPoolSize,
  'city-reveal': getCityRevealPoolSize,
};

// ── Shuffle (Fisher-Yates) ─────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Date helpers ───────────────────────────────────────────────────────────

function utcDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const client = postgres(DATABASE_URL!, { max: 1 });
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
      const startDate = lastScheduledDate ? addDays(lastScheduledDate, 1) : today;

      const unseen = unseenInCurrentCycle(existing, poolSize);

      if (unseen.length === 0) {
        console.log(`[${gameId}] Current cycle is fully scheduled (pool=${poolSize}). Run again after adding more puzzles.`);
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

main().catch((err) => {
  console.error('schedule-puzzles failed:', err);
  process.exit(1);
});
