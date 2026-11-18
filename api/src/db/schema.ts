import { sql } from 'drizzle-orm';
import { pgTable, text, integer, boolean, timestamp, real, primaryKey, date } from 'drizzle-orm/pg-core';

export const dailyStats = pgTable(
  'daily_stats',
  {
    gameId: text('game_id').notNull(),
    date: date('date').notNull(),
    plays: integer('plays').notNull().default(0),
    /** Only incremented for City Reveal (binary win/lose game) */
    wins: integer('wins').notNull().default(0),
    /** Only used for guess-count games (Where Most, City Reveal) */
    totalGuesses: integer('total_guesses').notNull().default(0),
    /** Only used for score-based games (Where Most 0–100, GeoPlace 0–100) */
    totalScore: integer('total_score').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.date] })],
);

export const whereMostPlays = pgTable(
  'where_most_plays',
  {
    deviceId: text('device_id').notNull(),
    date: date('date').notNull(),
    guesses: integer('guesses').notNull(),
    score: integer('score').notNull(), // 0–100: % of total top-5 metric value achieved
    exactMatches: integer('exact_matches').notNull().default(0), // Count of exact top-5 countries found
    guessCountries: text('guess_countries').array().notNull().default(sql`ARRAY[]::text[]`),
    /**
     * Id of the question played. Null when it isn't known: plays from before migration 0004 on days
     * with no schedule row, and plays saved by old-code machines during the 0004 deploy.
     */
    questionId: text('question_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.date] })],
);

export const cityRevealPlays = pgTable(
  'city_reveal_plays',
  {
    deviceId: text('device_id').notNull(),
    date: date('date').notNull(),
    won: boolean('won').notNull(),
    guesses: integer('guesses').notNull(),
    /**
     * Id of the city played. Null when it isn't known: plays from before migration 0004 on days
     * with no schedule row, and plays saved by old-code machines during the 0004 deploy.
     */
    cityId: text('city_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.date] })],
);

export const geoplacePlays = pgTable(
  'geoplace_plays',
  {
    deviceId: text('device_id').notNull(),
    date: date('date').notNull(),
    score: integer('score').notNull(), // 0–100 average across all rounds
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.date] })],
);

export const geoplacePlacements = pgTable(
  'geoplace_placements',
  {
    deviceId: text('device_id').notNull(),
    date: date('date').notNull(),
    targetIso3: text('target_iso3').notNull(),
    clickLat: real('click_lat').notNull(),
    clickLon: real('click_lon').notNull(),
    score: integer('score').notNull(), // 0–100 for this single round
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.date, t.targetIso3] })],
);

export const puzzleSchedule = pgTable(
  'puzzle_schedule',
  {
    gameId: text('game_id').notNull(),
    date: date('date').notNull(),
    /**
     * Id of the day's puzzle: a Where Most question id or a City Reveal city id. Null only for
     * rows from before migration 0004 whose old position matched no puzzle.
     */
    puzzleId: text('puzzle_id'),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.date] })],
);
