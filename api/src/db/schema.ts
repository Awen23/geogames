import { pgTable, text, integer, boolean, timestamp, primaryKey, date } from 'drizzle-orm/pg-core';

export const dailyStats = pgTable(
  'daily_stats',
  {
    gameId: text('game_id').notNull(),
    date: date('date').notNull(),
    plays: integer('plays').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    totalGuesses: integer('total_guesses').notNull().default(0),
    bullseyeFirstCount: integer('bullseye_first_count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.date] })],
);

export const plays = pgTable(
  'plays',
  {
    deviceId: text('device_id').notNull(),
    gameId: text('game_id').notNull(),
    date: date('date').notNull(),
    won: boolean('won').notNull(),
    guesses: integer('guesses').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.gameId, t.date] })],
);
