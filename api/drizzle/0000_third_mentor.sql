CREATE TABLE "daily_stats" (
	"game_id" text NOT NULL,
	"date" date NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"total_guesses" integer DEFAULT 0 NOT NULL,
	"bullseye_first_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_stats_game_id_date_pk" PRIMARY KEY("game_id","date")
);
--> statement-breakpoint
CREATE TABLE "plays" (
	"device_id" text NOT NULL,
	"game_id" text NOT NULL,
	"date" date NOT NULL,
	"won" boolean NOT NULL,
	"guesses" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plays_device_id_game_id_date_pk" PRIMARY KEY("device_id","game_id","date")
);
