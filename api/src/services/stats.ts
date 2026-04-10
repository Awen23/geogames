import { db } from '../db/client';
import { dailyStats, plays } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

interface PlayRecord {
  deviceId: string;
  gameId: string;
  date: string;
  won: boolean;
  guesses: number;
}

export async function recordPlay(record: PlayRecord): Promise<void> {
  const { deviceId, gameId, date, won, guesses } = record;

  const inserted = await db
    .insert(plays)
    .values({ deviceId, gameId, date, won, guesses })
    .onConflictDoNothing()
    .returning();

  // Skip stats update if this device already submitted a result for today
  if (inserted.length === 0) { return; }

  await db
    .insert(dailyStats)
    .values({
      gameId,
      date,
      plays: 1,
      wins: won ? 1 : 0,
      totalGuesses: guesses,
      bullseyeFirstCount: won && guesses === 1 ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [dailyStats.gameId, dailyStats.date],
      set: {
        plays: sql`${dailyStats.plays} + 1`,
        wins: won ? sql`${dailyStats.wins} + 1` : dailyStats.wins,
        totalGuesses: sql`${dailyStats.totalGuesses} + ${guesses}`,
        bullseyeFirstCount:
          won && guesses === 1
            ? sql`${dailyStats.bullseyeFirstCount} + 1`
            : dailyStats.bullseyeFirstCount,
      },
    });
}

export async function getTodayStats(
  gameId: string,
  date: string,
): Promise<{ plays: number; bullseyeRate: number; avgGuesses: number }> {
  const rows = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.gameId, gameId), eq(dailyStats.date, date)))
    .limit(1);

  if (rows.length === 0) {
    return { plays: 0, bullseyeRate: 0, avgGuesses: 0 };
  }

  const row = rows[0];
  return {
    plays: row.plays,
    // "perfect" = all 5 top countries found = won; bullseyeFirstCount is legacy and unused
    bullseyeRate: row.plays > 0 ? row.wins / row.plays : 0,
    avgGuesses: row.plays > 0 ? row.totalGuesses / row.plays : 0,
  };
}
