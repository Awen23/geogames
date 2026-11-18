import { and, asc, eq, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { puzzleSchedule } from '../db/schema';
import { seedIndex } from './daily';
import { pickNextPuzzle } from './scheduleUtils';

/**
 * A random number in [0, 1) that's the same for every request for a game on a given date, so
 * concurrent requests pick the same puzzle. It returns the same number on every call, which is
 * fine because pickNextPuzzle calls it at most once.
 */
function dateSeededRandom(gameId: string, date: string): () => number {
  return () => seedIndex(gameId, date, 1_000_000) / 1_000_000;
}

/** Puzzle ids shown before `date`, oldest first. */
async function historyBefore(gameId: string, date: string): Promise<string[]> {
  const rows = await db
    .select({ puzzleId: puzzleSchedule.puzzleId })
    .from(puzzleSchedule)
    .where(and(eq(puzzleSchedule.gameId, gameId), lt(puzzleSchedule.date, date)))
    .orderBy(asc(puzzleSchedule.date));
  return rows.flatMap((row) => (row.puzzleId ? [row.puzzleId] : []));
}

async function savedPuzzleId(gameId: string, date: string): Promise<string | null> {
  const [row] = await db
    .select({ puzzleId: puzzleSchedule.puzzleId })
    .from(puzzleSchedule)
    .where(and(eq(puzzleSchedule.gameId, gameId), eq(puzzleSchedule.date, date)))
    .limit(1);
  return row?.puzzleId ?? null;
}

/**
 * Returns the id of a game's puzzle for a date: a Mostle question id or a Maple city id.
 * Only ever returns an id from `puzzleIds`.
 *
 * Normally the deploy script (`api/src/db/schedule.ts`) has already scheduled the day.
 * - No row for the day (no deploy for a while): picks a puzzle the same way the deploy
 *   script would, and saves it, so every request and the next day's pick agree.
 * - The row's puzzle has been removed: the deploy script clears those rows from today on,
 *   so this only happens before it has run. Serves a pick without saving it.
 * - The database is unavailable: falls back to a hash of the date.
 */
export async function getScheduledPuzzleId(
  gameId: string,
  date: string,
  puzzleIds: readonly string[],
): Promise<string> {
  if (puzzleIds.length === 0) {
    throw new Error(`[dailySchedule] ${gameId} has no puzzles to schedule`);
  }

  try {
    const scheduled = await savedPuzzleId(gameId, date);
    if (scheduled && puzzleIds.includes(scheduled)) {
      return scheduled;
    }

    const picked = pickNextPuzzle(await historyBefore(gameId, date), puzzleIds, dateSeededRandom(gameId, date));

    await db.insert(puzzleSchedule).values({ gameId, date, puzzleId: picked }).onConflictDoNothing();

    // Another request may have saved the day first; use whatever was saved. If the existing row's
    // puzzle was removed, the insert did nothing and `picked` is served unsaved.
    const saved = await savedPuzzleId(gameId, date);
    return saved && puzzleIds.includes(saved) ? saved : picked;
  } catch (err) {
    console.error(`[dailySchedule] ${gameId}: DB lookup failed, using seedIndex fallback`, err);
    return puzzleIds[seedIndex(gameId, date, puzzleIds.length)];
  }
}
