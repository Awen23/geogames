export type Tier = 'bullseye' | 'top5' | 'top15' | 'cold';

export interface RankedCountry {
  iso3: string;
  value: number;
}

export interface Question {
  id: string;
  prompt: string;
  metric: string;
  unit: string;
  source: string;
  sourceUrl: string;
  /** index 0 = #1 in the world = the correct answer */
  ranking: RankedCountry[];
}

export interface GuessResult {
  tier: Tier;
  /** 1-based rank; null if iso3 not in ranking */
  rank: number | null;
  isCorrect: boolean;
  distanceKm: number;
  bearingDeg: number;
}

export interface TodayResponse {
  id: string;
  date: string;
  prompt: string;
  metric: string;
  unit: string;
  source: string;
  sourceUrl: string;
  // ranking deliberately omitted — it's the answer
}

export interface TodayStatsResponse {
  plays: number;
  bullseyeRate: number;
  avgGuesses: number;
}

export interface GameInfo {
  id: string;
  title: string;
  tagline: string;
  enabled: boolean;
}
