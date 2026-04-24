ALTER TABLE IF EXISTS "where_most_plays" ADD COLUMN IF NOT EXISTS "exact_matches" integer DEFAULT 0 NOT NULL;
