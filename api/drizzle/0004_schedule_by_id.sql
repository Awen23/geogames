-- Where Most and City Reveal schedule puzzles by id instead of by position in their lists.
-- Existing rows are converted to ids, past plays get the id of the puzzle they were for, and
-- the position column is dropped. Like every migration, Drizzle runs this once; it can't be re-run
-- by hand after the last statement, because the UPDATEs read the dropped column.
ALTER TABLE "puzzle_schedule" ADD COLUMN IF NOT EXISTS "puzzle_id" text;
--> statement-breakpoint
-- Each existing Where Most row stores a position in questions[]. Map it to the question that was
-- at that position when this migration was written. questions[] has only ever been appended to,
-- so these positions mean the same question on every date already scheduled.
UPDATE "puzzle_schedule" AS s
SET "puzzle_id" = m.id
FROM (VALUES
  (0, 'beer-per-capita'),
  (1, 'milk-per-capita'),
  (2, 'meat-per-capita'),
  (3, 'fish-seafood-per-capita'),
  (4, 'total-alcohol-per-capita'),
  (5, 'spirits-per-capita'),
  (6, 'adult-smoking-share'),
  (7, 'adult-obesity-share'),
  (8, 'renewable-electricity-share'),
  (9, 'life-expectancy'),
  (10, 'mean-years-schooling'),
  (11, 'life-satisfaction'),
  (12, 'co2-emissions-per-capita'),
  (13, 'fertility-rate'),
  (14, 'energy-use-per-capita'),
  (15, 'gdp-per-capita'),
  (16, 'cocoa-consumption-per-capita'),
  (17, 'urban-agglomerations-million-share'),
  (18, 'largest-city-urban-share'),
  (19, 'migrant-stock-share'),
  (20, 'agricultural-labour-force-share'),
  (21, 'agricultural-land-per-capita'),
  (22, 'food-expenditure-per-person'),
  (23, 'women-married-or-in-union-share'),
  (24, 'ai-publications'),
  (25, 'generative-ai-use-share'),
  (26, 'tax-revenue-share-gdp'),
  (27, 'working-hours-per-worker'),
  (28, 'wind-electricity-share'),
  (29, 'solar-electricity-share'),
  (30, 'forest-area-share'),
  (31, 'patent-applications-per-million')
) AS m(idx, id)
WHERE s."game_id" = 'where-most' AND s."puzzle_index" = m.idx;
--> statement-breakpoint
-- Each existing City Reveal row stores a position among the cities marked implemented in
-- shared/cityRevealCities.ts. Map it to the city at that position when this migration was
-- written, which is the city the server shows for that row today.
-- Known gap: cities were switched on mid-list twice (e84a658 on 9 May 2026, 7 -> 26 cities, and
-- ab7041d on 15 May 2026, 26 -> 61), so rows and plays dated before the 15 May deploy may name a
-- different city from the one players saw. Accepted: few plays, long ago. Each id maps back to
-- exactly one position in this list, so a later migration can correct them by date if needed.
UPDATE "puzzle_schedule" AS s
SET "puzzle_id" = m.id
FROM (VALUES
  (0, 'bern'), (1, 'paris'), (2, 'amsterdam'), (3, 'stockholm'), (4, 'warsaw'),
  (5, 'athens'), (6, 'osaka'), (7, 'seoul'), (8, 'bangkok'), (9, 'singapore'),
  (10, 'kathmandu'), (11, 'bishkek'), (12, 'tegucigalpa'), (13, 'la-paz'), (14, 'havana'),
  (15, 'kinshasa'), (16, 'cairo'), (17, 'dakar'), (18, 'perth'), (19, 'auckland'),
  (20, 'dubai'), (21, 'tehran'), (22, 'madrid'), (23, 'barcelona'), (24, 'milan'),
  (25, 'edinburgh'), (26, 'munich'), (27, 'kyiv'), (28, 'chicago'), (29, 'dublin'),
  (30, 'zagreb'), (31, 'reykjavik'), (32, 'taipei'), (33, 'colombo'), (34, 'accra'),
  (35, 'abidjan'), (36, 'kigali'), (37, 'kampala'), (38, 'windhoek'), (39, 'antananarivo'),
  (40, 'yerevan'), (41, 'sofia'), (42, 'phnom-penh'), (43, 'san-salvador'), (44, 'asmara'),
  (45, 'suva'), (46, 'georgetown-guyana'), (47, 'vientiane'), (48, 'riga'), (49, 'vilnius'),
  (50, 'male'), (51, 'valletta'), (52, 'chisinau'), (53, 'yangon'), (54, 'basseterre'),
  (55, 'san-marino'), (56, 'riyadh'), (57, 'bratislava'), (58, 'ljubljana'), (59, 'damascus'),
  (60, 'sanaa')
) AS m(idx, id)
WHERE s."game_id" = 'city-reveal' AND s."puzzle_index" = m.idx;
--> statement-breakpoint
ALTER TABLE "where_most_plays" ADD COLUMN IF NOT EXISTS "question_id" text;
--> statement-breakpoint
-- Fill in the puzzle for past plays from that day's schedule. Plays on days with no schedule row
-- (after the old schedule ran out) stay null: which puzzle they saw wasn't recorded anywhere.
UPDATE "where_most_plays" AS p
SET "question_id" = s."puzzle_id"
FROM "puzzle_schedule" AS s
WHERE s."game_id" = 'where-most' AND s."date" = p."date";
--> statement-breakpoint
ALTER TABLE "city_reveal_plays" ADD COLUMN IF NOT EXISTS "city_id" text;
--> statement-breakpoint
UPDATE "city_reveal_plays" AS p
SET "city_id" = s."puzzle_id"
FROM "puzzle_schedule" AS s
WHERE s."game_id" = 'city-reveal' AND s."date" = p."date";
--> statement-breakpoint
-- Every row's position is now stored as an id, so the position is no longer needed.
ALTER TABLE "puzzle_schedule" DROP COLUMN IF EXISTS "puzzle_index";
