-- Drop old generic plays table (replaced by per-game tables below)
DROP TABLE IF EXISTS "plays";
--> statement-breakpoint

-- Where Most: score-only game, no win/lose
CREATE TABLE IF NOT EXISTS "where_most_plays" (
	"device_id" text NOT NULL,
	"date" date NOT NULL,
	"guesses" integer NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "where_most_plays_device_id_date_pk" PRIMARY KEY("device_id","date")
);
--> statement-breakpoint

-- City Reveal: binary win/lose
CREATE TABLE IF NOT EXISTS "city_reveal_plays" (
	"device_id" text NOT NULL,
	"date" date NOT NULL,
	"won" boolean NOT NULL,
	"guesses" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "city_reveal_plays_device_id_date_pk" PRIMARY KEY("device_id","date")
);
--> statement-breakpoint

-- GeoPlace: score-only game (0–100 average), no win/lose
CREATE TABLE IF NOT EXISTS "geoplace_plays" (
	"device_id" text NOT NULL,
	"date" date NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geoplace_plays_device_id_date_pk" PRIMARY KEY("device_id","date")
);
--> statement-breakpoint

-- GeoPlace per-round placement history
CREATE TABLE IF NOT EXISTS "geoplace_placements" (
	"device_id" text NOT NULL,
	"date" date NOT NULL,
	"target_iso3" text NOT NULL,
	"click_lat" real NOT NULL,
	"click_lon" real NOT NULL,
	"score" integer NOT NULL,
	CONSTRAINT "geoplace_placements_device_id_date_target_iso3_pk" PRIMARY KEY("device_id","date","target_iso3")
);
--> statement-breakpoint

-- Puzzle schedule: no-repeat ordering, filled by tools/schedule-puzzles.ts
CREATE TABLE IF NOT EXISTS "puzzle_schedule" (
	"game_id" text NOT NULL,
	"date" date NOT NULL,
	"puzzle_index" integer NOT NULL,
	CONSTRAINT "puzzle_schedule_game_id_date_pk" PRIMARY KEY("game_id","date")
);
--> statement-breakpoint

-- Update daily_stats: replace bullseye_first_count (was broken) with total_score
ALTER TABLE "daily_stats" ADD COLUMN IF NOT EXISTS "total_score" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "daily_stats" DROP COLUMN IF EXISTS "bullseye_first_count";
