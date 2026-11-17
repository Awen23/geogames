import { useState, useCallback, useMemo, useRef } from 'react';
import type { GuessResult } from '@shared/types';
import { isArrayOf, isBoolean, isNumber, isRecord, isString, readJson, writeJson } from './storage';

interface DayResult {
  date: string;
  /** For City Reveal: actually won. For score-only games (Where Most, GeoPlace): always true (means played). */
  won: boolean;
  /** For guess-count games (Where Most, City Reveal). Not meaningful for GeoPlace. Counts only guesses that consumed a slot (excludes no-data on Mostle). */
  guesses: number;
  /** Game-specific score (0–100 for Where Most and GeoPlace). */
  score?: number;
  /** Mostle: exact top-N answers found. */
  exactMatches?: number;
  /** Mostle: ISO3 countries guessed (slot-consuming only), in order — matches API /result payload. */
  guessCountries?: string[];
  /** Mostle: graded guess details, same order as guessCountries. */
  guessResults?: GuessResult[];
  /** Mostle: full session order including no-data tiers (local replay only). */
  allGuesses?: Array<{ iso3: string; result: GuessResult }>;
}

interface PersistedState {
  history: DayResult[];
}

interface ResultDetails {
  exactMatches?: number;
  guessCountries?: string[];
  guessResults?: GuessResult[];
  allGuesses?: Array<{ iso3: string; result: GuessResult }>;
}

function storageKey(gameId: string) {
  return `geogames:${gameId}:state`;
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function isGuessResult(v: unknown): v is GuessResult {
  return isRecord(v) && isString(v.tier) && isBoolean(v.isTopFive)
    && (v.rank === null || isNumber(v.rank)) && (v.value === null || isNumber(v.value));
}

function isGuessEntry(v: unknown): v is { iso3: string; result: GuessResult } {
  return isRecord(v) && isString(v.iso3) && isGuessResult(v.result);
}

/**
 * Keeps a saved day if its core fields are valid. Malformed optional Mostle details are
 * dropped (the page then regrades from guessCountries, or shows less), not the whole day,
 * so one bad field can't cost a player their streak.
 */
function toDayResult(v: unknown): DayResult[] {
  if (!isRecord(v) || !isString(v.date) || !isBoolean(v.won) || !isNumber(v.guesses)) {
    return [];
  }
  return [{
    date: v.date,
    won: v.won,
    guesses: v.guesses,
    score: isNumber(v.score) ? v.score : undefined,
    exactMatches: isNumber(v.exactMatches) ? v.exactMatches : undefined,
    guessCountries: isArrayOf(v.guessCountries, isString) ? v.guessCountries : undefined,
    guessResults: isArrayOf(v.guessResults, isGuessResult) ? v.guessResults : undefined,
    allGuesses: isArrayOf(v.allGuesses, isGuessEntry) ? v.allGuesses : undefined,
  }];
}

export function loadState(gameId: string): PersistedState {
  const isSaved = (v: unknown): v is { history: unknown[] } => isRecord(v) && Array.isArray(v.history);
  const saved = readJson(storageKey(gameId), isSaved, { history: [] });
  return { history: saved.history.flatMap(toDayResult) };
}

function computeStreak(history: DayResult[]): { streak: number; longestStreak: number } {
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

export function useGameState(gameId: string) {
  const [persisted, setPersisted] = useState<PersistedState>(() => loadState(gameId));
  // Latest state, read synchronously so a second call in the same tick sees the first.
  const latest = useRef(persisted);

  const save = useCallback((next: PersistedState) => {
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
    (won: boolean, guesses: number, score?: number, details?: ResultDetails) => {
      const prev = latest.current;
      const alreadyRecorded = prev.history.some((r) => r.date === today);
      if (alreadyRecorded) { return; }
      save({
        history: [{ date: today, won, guesses, score, ...details }, ...prev.history].slice(0, 90),
      });
    },
    [save, today],
  );

  const resetForDev = useCallback(() => {
    save({ history: [] });
  }, [save]);

  return { todayResult, streak, longestStreak, history: persisted.history, recordResult, resetForDev };
}
