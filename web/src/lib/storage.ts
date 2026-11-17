/**
 * Guarded localStorage access. Stored data can be corrupt or from an older app version,
 * and storage itself can throw (disabled, quota exceeded, Safari private mode), so none of
 * these helpers ever throw: reads fall back, writes and removes log and carry on.
 */

/** Parses `key` as JSON; returns `fallback` if it is missing, unparsable or fails `isValid`. */
export function readJson<T>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) { return fallback; }
    const value: unknown = JSON.parse(raw);
    if (isValid(value)) { return value; }
    console.warn(`Ignoring saved ${key}: unexpected shape`);
  } catch (err) {
    console.warn(`Ignoring saved ${key}:`, err);
  }
  return fallback;
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to save ${key}:`, err);
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`Failed to remove ${key}:`, err);
  }
}

// ── Type-guard building blocks ────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArrayOf<T>(value: unknown, isItem: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(isItem);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
