import { db } from '../db/client';
import { puzzleSchedule } from '../db/schema';
import { eq, and, lt, desc } from 'drizzle-orm';
import { seedIndex } from './daily';

function clampPuzzleIndex(idx: number, poolSize: number): number {
  if (poolSize <= 0) {
    return 0;
  }
  if (!Number.isFinite(idx)) {
    return 0;
  }
  const n = Math.floor(idx);
  return Math.max(0, Math.min(poolSize - 1, n));
}

/**
 * Returns the scheduled puzzle index for a game on a given date.
 *
 * Primary: queries puzzle_schedule for an exact (game_id, date) match.
 * Fallback: if no row exists (schedule gap before new puzzles are added),
 *   picks the puzzle index shown least recently to minimise recency of repeats.
 * Last resort: returns 0 if there are no scheduled rows at all.
 *
 * If the database is unavailable, migrations are missing, or any query throws,
 * falls back to deterministic `seedIndex` so daily games still load.
 */
export async function getScheduledPuzzleIndex(
  gameId: string,
  date: string,
  poolSize: number,
): Promise<number> {
  if (poolSize <= 0) {
    return 0;
  }

  try {
    const exact = await db
      .select({ puzzleIndex: puzzleSchedule.puzzleIndex })
      .from(puzzleSchedule)
      .where(and(eq(puzzleSchedule.gameId, gameId), eq(puzzleSchedule.date, date)))
      .limit(1);

    if (exact.length > 0) {
      return clampPuzzleIndex(exact[0].puzzleIndex, poolSize);
    }

    // Fallback: find which index was shown least recently
    const recent = await db
      .select({ puzzleIndex: puzzleSchedule.puzzleIndex })
      .from(puzzleSchedule)
      .where(and(eq(puzzleSchedule.gameId, gameId), lt(puzzleSchedule.date, date)))
      .orderBy(desc(puzzleSchedule.date))
      .limit(poolSize);

    if (recent.length === 0) {
      return seedIndex(gameId, date, poolSize);
    }

    const seenOrder = recent.map((r) => r.puzzleIndex);
    const seenSet = new Set(seenOrder);

    for (let i = 0; i < poolSize; i++) {
      if (!seenSet.has(i)) {
        return i;
      }
    }

    return clampPuzzleIndex(seenOrder[seenOrder.length - 1], poolSize);
  } catch (err) {
    console.error('[puzzleSchedule] DB lookup failed, using seedIndex fallback', err);
    return seedIndex(gameId, date, poolSize);
  }
}
