import { useState, useCallback, useMemo } from 'react';

interface DayResult {
  date: string;
  won: boolean;
  guesses: number;
}

interface PersistedState {
  history: DayResult[];
}

function storageKey(gameId: string) {
  return `geogames:${gameId}:state`;
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function loadState(gameId: string): PersistedState {
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    if (raw) { return JSON.parse(raw) as PersistedState; }
  } catch {
    // corrupt storage — reset
  }
  return { history: [] };
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
    (won: boolean, guesses: number) => {
      setPersisted((prev) => {
        const alreadyRecorded = prev.history.some((r) => r.date === today);
        if (alreadyRecorded) { return prev; }
        const next: PersistedState = {
          history: [{ date: today, won, guesses }, ...prev.history].slice(0, 90),
        };
        localStorage.setItem(storageKey(gameId), JSON.stringify(next));
        return next;
      });
    },
    [gameId, today],
  );

  return { todayResult, streak, longestStreak, history: persisted.history, recordResult };
}
