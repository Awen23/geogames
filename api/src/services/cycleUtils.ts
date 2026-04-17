/**
 * Pure utility for puzzle scheduling — determines which puzzle indices
 * have not yet been shown in the current (incomplete) cycle.
 *
 * Walks entries in date order. When all poolSize distinct indices have been
 * seen, the cycle resets and counting starts again from zero.
 */
export function unseenInCurrentCycle(
  entries: { date: string; puzzleIndex: number }[],
  poolSize: number,
): number[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let seenThisCycle = new Set<number>();

  for (const entry of sorted) {
    seenThisCycle.add(entry.puzzleIndex);
    if (seenThisCycle.size === poolSize) {
      seenThisCycle = new Set<number>();
    }
  }

  return Array.from({ length: poolSize }, (_, i) => i).filter(
    (i) => !seenThisCycle.has(i),
  );
}
