import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isArrayOf, isRecord, isString, readJson, removeKey, writeJson } from './storage';

/** Minimal in-memory Storage: vitest runs web tests in node, which has no localStorage. */
class MemoryStorage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  key(i: number) { return [...this.items.keys()][i] ?? null; }
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { this.items.set(key, String(value)); }
  removeItem(key: string) { this.items.delete(key); }
  clear() { this.items.clear(); }
}

const isNames = (v: unknown): v is { names: string[] } => isRecord(v) && isArrayOf(v.names, isString);
const FALLBACK = { names: [] as string[] };

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readJson', () => {
  it('returns a stored value that passes the guard', () => {
    storage.setItem('k', JSON.stringify({ names: ['a', 'b'] }));
    expect(readJson('k', isNames, FALLBACK)).toEqual({ names: ['a', 'b'] });
  });

  it('returns the fallback for a missing key', () => {
    expect(readJson('k', isNames, FALLBACK)).toBe(FALLBACK);
  });

  it('returns the fallback for corrupt JSON', () => {
    storage.setItem('k', '{not json');
    expect(readJson('k', isNames, FALLBACK)).toBe(FALLBACK);
  });

  it('returns the fallback for the wrong shape', () => {
    for (const bad of ['null', '5', '"x"', '[]', '{"names":5}', '{"names":[1]}']) {
      storage.setItem('k', bad);
      expect(readJson('k', isNames, FALLBACK)).toBe(FALLBACK);
    }
  });

  it('returns the fallback when getItem throws', () => {
    storage.getItem = () => { throw new Error('SecurityError'); };
    expect(readJson('k', isNames, FALLBACK)).toBe(FALLBACK);
  });
});

describe('writeJson / removeKey', () => {
  it('round-trips through readJson', () => {
    writeJson('k', { names: ['a'] });
    expect(readJson('k', isNames, FALLBACK)).toEqual({ names: ['a'] });
    removeKey('k');
    expect(storage.getItem('k')).toBeNull();
  });

  it('does not throw when setItem or removeItem throws', () => {
    storage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    storage.removeItem = () => { throw new Error('SecurityError'); };
    expect(() => writeJson('k', { names: [] })).not.toThrow();
    expect(() => removeKey('k')).not.toThrow();
  });
});
