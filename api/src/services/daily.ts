export function utcDateString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** FNV-1a 32-bit hash */
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

/**
 * Deterministic number in [0, poolSize) for a game + UTC date. Used to pick a puzzle when the
 * database is down, and as the date-seeded random number when a day is scheduled on request.
 */
export function seedIndex(gameId: string, date: string, poolSize: number): number {
  return fnv1a(`${gameId}:${date}`) % poolSize;
}
