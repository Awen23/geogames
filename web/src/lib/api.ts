import type { TodayResponse, GuessResult, TodayStatsResponse, GameInfo, GeoplaceStatsResponse } from '@shared/types';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchGames(): Promise<GameInfo[]> {
  return apiFetch('/api/games');
}

export function fetchToday(): Promise<TodayResponse> {
  return apiFetch('/api/games/where-most/today');
}

export function gradeGuess(iso3: string, guessIndex: number): Promise<GuessResult> {
  return apiFetch('/api/games/where-most/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iso3, guessIndex }),
    credentials: 'include',
  });
}

export function submitResult(won: boolean, guesses: number): Promise<void> {
  return apiFetch('/api/games/where-most/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ won, guesses }),
    credentials: 'include',
  });
}

export function fetchTodayStats(): Promise<TodayStatsResponse> {
  return apiFetch('/api/games/where-most/stats/today');
}

export function submitGeoplaceResult(score: number): Promise<void> {
  return apiFetch('/api/games/geoplace/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score }),
    credentials: 'include',
  });
}

export function fetchGeoplaceStats(): Promise<GeoplaceStatsResponse> {
  return apiFetch('/api/games/geoplace/stats/today');
}
