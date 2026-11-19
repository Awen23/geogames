export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** One scheduled day: the id of the puzzle (a Mostle question or a Maple city) shown on that date. */
export interface ScheduledPuzzle {
  date: string;
  puzzleId: string;
}

/**
 * Picks the puzzle for the next day, given the puzzles already shown (oldest first).
 *
 * Puzzles never shown come first. Otherwise it picks at random from the quarter of puzzles
 * shown longest ago, so the order changes from cycle to cycle. A puzzle that has waited a
 * cycle and a quarter is picked straight away, so with n puzzles every repeat comes between
 * 3n/4 and 5n/4 scheduled days after the last one. (Days are counted as entries in `history`,
 * so a stretch of dates with no schedule rows doesn't count towards the wait.)
 * `random` returns a number in [0, 1).
 */
export function pickNextPuzzle(
  history: readonly string[],
  puzzleIds: readonly string[],
  random: () => number,
): string {
  if (puzzleIds.length === 0) {
    throw new Error('pickNextPuzzle needs at least one puzzle');
  }

  const lastShown = new Map<string, number>();
  history.forEach((puzzleId, day) => lastShown.set(puzzleId, day));

  const neverShown = puzzleIds.filter((puzzleId) => !lastShown.has(puzzleId));
  if (neverShown.length > 0) {
    return neverShown[Math.floor(random() * neverShown.length)];
  }

  const quarter = Math.max(1, Math.floor(puzzleIds.length / 4));
  const byLongestAgo = [...puzzleIds].sort((a, b) => lastShown.get(a)! - lastShown.get(b)!);
  const daysWaiting = history.length - lastShown.get(byLongestAgo[0])!;

  if (daysWaiting >= puzzleIds.length + quarter) {
    return byLongestAgo[0];
  }

  const pool = byLongestAgo.slice(0, quarter);
  return pool[Math.floor(random() * pool.length)];
}

/**
 * Plans every day from `today` to `today + daysAhead` that doesn't have a puzzle yet.
 * `existing` is every scheduled day so far, in date order; days already scheduled are kept.
 */
export function planPuzzleDays(
  existing: readonly ScheduledPuzzle[],
  puzzleIds: readonly string[],
  today: string,
  daysAhead: number,
  random: () => number,
): ScheduledPuzzle[] {
  const scheduledByDate = new Map(existing.map((day) => [day.date, day.puzzleId]));
  const history = existing.filter((day) => day.date < today).map((day) => day.puzzleId);
  const planned: ScheduledPuzzle[] = [];

  for (let offset = 0; offset <= daysAhead; offset++) {
    const date = addDays(today, offset);
    const puzzleId = scheduledByDate.get(date) ?? pickNextPuzzle(history, puzzleIds, random);

    if (!scheduledByDate.has(date)) {
      planned.push({ date, puzzleId });
    }
    history.push(puzzleId);
  }

  return planned;
}
