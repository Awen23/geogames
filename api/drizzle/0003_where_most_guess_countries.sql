ALTER TABLE IF EXISTS "where_most_plays" ADD COLUMN IF NOT EXISTS "guess_countries" text[] DEFAULT ARRAY[]::text[] NOT NULL;
