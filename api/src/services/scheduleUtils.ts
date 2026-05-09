/**
 * Returns puzzle indices in [0, poolSize) that have never been scheduled.
 * Once every index has a row, returns [] — new days are not scheduled until
 * the pool grows (more content added) and this function sees new indices.
 */
export function unscheduledIndices(
  entries: { puzzleIndex: number }[],
  poolSize: number,
): number[] {
  const scheduled = new Set<number>();

  for (const entry of entries) {
    const index = entry.puzzleIndex;
    if (index >= 0 && index < poolSize) {
      scheduled.add(index);
    }
  }

  return Array.from({ length: poolSize }, (_, i) => i).filter(
    (i) => !scheduled.has(i),
  );
}
