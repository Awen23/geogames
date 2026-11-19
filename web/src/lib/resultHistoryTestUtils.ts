import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, vi } from 'vitest';

/** The fixed "today" (UTC) for result history tests. */
export const TODAY = '2026-11-19';

/**
 * For each test: fixes today's date and stubs localStorage (vitest runs web tests in node,
 * which has none) with a Map-backed stand-in. Returns that Map, cleared before each test.
 */
export function stubStorageAndToday(): Map<string, string> {
  const items = new Map<string, string>();

  beforeEach(() => {
    items.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => { items.set(k, v); },
      removeItem: (k: string) => { items.delete(k); },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  return items;
}

/**
 * Runs a hook once and returns what it returned. Server rendering needs no DOM; the hook's
 * setState is a no-op there, but recordResult still writes localStorage, which is what we check.
 */
export function renderHook<T>(hook: () => T): T {
  let result: T | undefined;
  function Probe() {
    result = hook();
    return null;
  }
  renderToString(createElement(Probe));
  return result as T;
}
