import type {
  TodayResponse,
  WhereMostStatsResponse,
  GuessResult,
  GameInfo,
  GeoplaceStatsResponse,
  GeoplacePlacement,
} from '@shared/types';
import type { CityRevealTodayResponse, CityRevealGuessResponse } from '@shared/cityRevealTypes';

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

export function gradeGuess(iso3: string): Promise<GuessResult> {
  return apiFetch('/api/games/where-most/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iso3 }),
    credentials: 'include',
  });
}

/** Submit Where Most result. score is 0–100 (% of total top-5 value achieved). */
export function submitWhereMostResult(
  score: number,
  guesses: number,
  exactMatches: number,
  guessCountries: string[],
): Promise<void> {
  return apiFetch('/api/games/where-most/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score, guesses, exactMatches, guessCountries }),
    credentials: 'include',
  });
}

export function fetchTodayStats(): Promise<WhereMostStatsResponse> {
  return apiFetch('/api/games/where-most/stats/today');
}

/** Submit GeoPlace result. score is 0–100 average. placements holds per-round detail. */
export function submitGeoplaceResult(score: number, placements: GeoplacePlacement[]): Promise<void> {
  return apiFetch('/api/games/geoplace/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score, placements }),
    credentials: 'include',
  });
}

export function fetchGeoplaceStats(): Promise<GeoplaceStatsResponse> {
  return apiFetch('/api/games/geoplace/stats/today');
}

export function fetchCityRevealToday(): Promise<CityRevealTodayResponse> {
  return apiFetch('/api/games/city-reveal/today');
}

export function guessCityReveal(cityId: string): Promise<CityRevealGuessResponse> {
  return apiFetch('/api/games/city-reveal/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cityId }),
    credentials: 'include',
  });
}

export function submitCityRevealResult(won: boolean, guesses: number): Promise<void> {
  return apiFetch('/api/games/city-reveal/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ won, guesses }),
    credentials: 'include',
  });
}
