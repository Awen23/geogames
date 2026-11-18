import { db } from '../db/client';
import { dailyStats, whereMostPlays, cityRevealPlays, geoplacePlays, geoplacePlacements } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

interface WhereMostRecord {
  deviceId: string;
  date: string;
  questionId: string;
  guesses: number;
  score: number; // 0–100
  exactMatches: number;
  guessCountries: string[];
}

interface CityRevealRecord {
  deviceId: string;
  date: string;
  cityId: string;
  won: boolean;
  guesses: number;
}

interface GeoplaceRecord {
  deviceId: string;
  date: string;
  score: number; // 0–100 average
  placements: { targetIso3: string; clickLat: number; clickLon: number; score: number }[];
}

export async function recordWhereMostPlay(record: WhereMostRecord): Promise<void> {
  const { deviceId, date, questionId, guesses, score, exactMatches, guessCountries } = record;

  const inserted = await db
    .insert(whereMostPlays)
    .values({ deviceId, date, questionId, guesses, score, exactMatches, guessCountries })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) { return; }

  await db
    .insert(dailyStats)
    .values({ gameId: 'where-most', date, plays: 1, wins: 0, totalGuesses: guesses, totalScore: score })
    .onConflictDoUpdate({
      target: [dailyStats.gameId, dailyStats.date],
      set: {
        plays: sql`${dailyStats.plays} + 1`,
        totalGuesses: sql`${dailyStats.totalGuesses} + ${guesses}`,
        totalScore: sql`${dailyStats.totalScore} + ${score}`,
      },
    });
}

export async function recordCityRevealPlay(record: CityRevealRecord): Promise<void> {
  const { deviceId, date, cityId, won, guesses } = record;

  const inserted = await db
    .insert(cityRevealPlays)
    .values({ deviceId, date, cityId, won, guesses })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) { return; }

  await db
    .insert(dailyStats)
    .values({ gameId: 'city-reveal', date, plays: 1, wins: won ? 1 : 0, totalGuesses: guesses, totalScore: 0 })
    .onConflictDoUpdate({
      target: [dailyStats.gameId, dailyStats.date],
      set: {
        plays: sql`${dailyStats.plays} + 1`,
        wins: won ? sql`${dailyStats.wins} + 1` : dailyStats.wins,
        totalGuesses: sql`${dailyStats.totalGuesses} + ${guesses}`,
      },
    });
}

export async function recordGeoplacePlay(record: GeoplaceRecord): Promise<void> {
  const { deviceId, date, score, placements } = record;

  const inserted = await db
    .insert(geoplacePlays)
    .values({ deviceId, date, score })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) { return; }

  if (placements.length > 0) {
    await db
      .insert(geoplacePlacements)
      .values(placements.map((p) => ({
        deviceId,
        date,
        targetIso3: p.targetIso3,
        clickLat: p.clickLat,
        clickLon: p.clickLon,
        score: p.score,
      })))
      .onConflictDoNothing();
  }

  await db
    .insert(dailyStats)
    .values({ gameId: 'geoplace', date, plays: 1, wins: 0, totalGuesses: 0, totalScore: score })
    .onConflictDoUpdate({
      target: [dailyStats.gameId, dailyStats.date],
      set: {
        plays: sql`${dailyStats.plays} + 1`,
        totalScore: sql`${dailyStats.totalScore} + ${score}`,
      },
    });
}

export async function getTodayStats(
  gameId: string,
  date: string,
): Promise<{ plays: number; wins: number; totalGuesses: number; totalScore: number }> {
  const rows = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.gameId, gameId), eq(dailyStats.date, date)))
    .limit(1);

  if (rows.length === 0) {
    return { plays: 0, wins: 0, totalGuesses: 0, totalScore: 0 };
  }

  const { plays, wins, totalGuesses, totalScore } = rows[0];
  return { plays, wins, totalGuesses, totalScore };
}
