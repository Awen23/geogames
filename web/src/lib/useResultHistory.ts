import { useState, useCallback, useMemo, useRef } from 'react';
import { isBoolean, isNumber, isRecord, isString, readJson, writeJson } from './storage';

/** The fields every game records for a day. */
interface CoreDayResult {
  date: string;
  /** For City Reveal: actually won. For score-only games (Where Most, GeoPlace): always true (means played). */
  won: boolean;
  /** For guess-count games (Where Most, City Reveal). Not meaningful for GeoPlace. Counts only guesses that consumed a slot (excludes no-data on Mostle). */
  guesses: number;
  /** Game-specific score (0–100 for Where Most and GeoPlace). */
  score?: number;
}

/** The details of a game that records only the core fields. */
export type NoDetails = Record<never, never>;

/** One day's result. `D` is the game's own details, saved flat alongside the core fields. */
export type DayResult<D extends object = NoDetails> = CoreDayResult & D;

/**
 * Reads a game's own details from a saved day. Malformed details should be dropped, not
 * the whole day, so one bad field can't cost a player their streak.
 */
export type DetailsReader<D extends object> = (saved: Record<string, unknown>) => D;

interface SavedHistory<D extends object> {
  history: DayResult<D>[];
}

/** The reader for a game that records only the core fields. */
export const readNoDetails: DetailsReader<NoDetails> = () => ({});

// The key predates the rename to result history; it stays so saved histories keep loading.
function storageKey(gameId: string) {
  return `geogames:${gameId}:state`;
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

/** Keeps a saved day if its core fields are valid, with whatever details `readDetails` accepts. */
function toDayResult<D extends object>(v: unknown, readDetails: DetailsReader<D>): DayResult<D>[] {
  if (!isRecord(v) || !isString(v.date) || !isBoolean(v.won) || !isNumber(v.guesses)) {
    return [];
  }
  return [{
    date: v.date,
    won: v.won,
    guesses: v.guesses,
    score: isNumber(v.score) ? v.score : undefined,
    ...readDetails(v),
  }];
}

/** Loads a game's saved history, keeping the core fields and whatever details `readDetails` reads. */
export function loadResultHistory<D extends object>(gameId: string, readDetails: DetailsReader<D>): SavedHistory<D> {
  const isSaved = (v: unknown): v is { history: unknown[] } => isRecord(v) && Array.isArray(v.history);
  const saved = readJson(storageKey(gameId), isSaved, { history: [] });
  return { history: saved.history.flatMap((v) => toDayResult(v, readDetails)) };
}

function computeStreak(history: CoreDayResult[]): { streak: number; longestStreak: number } {
  // Sort descending so won[0] is the most recent win
  const won = history
    .filter((r) => r.won)
    .map((r) => r.date)
    .sort()
    .reverse();

  if (won.length === 0) { return { streak: 0, longestStreak: 0 }; }

  // Single pass: track the leading (most-recent) consecutive run and the longest overall
  let longestStreak = 1;
  let current = 1;
  let leadingStreak = 1;
  let leadingRunEnded = false;

  for (let i = 1; i < won.length; i++) {
    const diffDays = Math.round(
      (new Date(won[i - 1]).getTime() - new Date(won[i]).getTime()) / 86400000,
    );
    if (diffDays === 1) {
      current++;
      if (!leadingRunEnded) { leadingStreak++; }
    } else {
      longestStreak = Math.max(longestStreak, current);
      current = 1;
      leadingRunEnded = true;
    }
  }
  longestStreak = Math.max(longestStreak, current);

  const today = utcToday();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = (won[0] === today || won[0] === yesterday) ? leadingStreak : 0;

  return { streak, longestStreak };
}

/**
 * A game's saved result history: today's result, the streak, and recording today's result.
 * `readDetails` is required: every caller loads, and the next recordResult writes back, only
 * what its reader keeps, so a game's details reader can't be forgotten (readNoDetails if none).
 */
export function useResultHistory<D extends object>(gameId: string, readDetails: DetailsReader<D>) {
  const [persisted, setPersisted] = useState<SavedHistory<D>>(() => loadResultHistory(gameId, readDetails));
  // Latest state, read synchronously so a second call in the same tick sees the first.
  const latest = useRef(persisted);

  const save = useCallback((next: SavedHistory<D>) => {
    latest.current = next;
    writeJson(storageKey(gameId), next);
    setPersisted(next);
  }, [gameId]);

  const today = utcToday();
  const todayResult = useMemo(
    () => persisted.history.find((r) => r.date === today) ?? null,
    [persisted.history, today],
  );

  const { streak, longestStreak } = useMemo(
    () => computeStreak(persisted.history),
    [persisted.history],
  );

  const recordResult = useCallback(
    (won: boolean, guesses: number, score?: number, details?: D) => {
      const prev = latest.current;
      const alreadyRecorded = prev.history.some((r) => r.date === today);
      if (alreadyRecorded) { return; }
      save({
        // D's fields must all be optional (as readers return them), so a day recorded without
        // details is still a DayResult<D>; spreading undefined adds nothing. The cast says so.
        history: [{ date: today, won, guesses, score, ...(details as D) }, ...prev.history].slice(0, 90),
      });
    },
    [save, today],
  );

  const resetForDev = useCallback(() => {
    save({ history: [] });
  }, [save]);

  return { todayResult, streak, longestStreak, history: persisted.history, recordResult, resetForDev };
}
