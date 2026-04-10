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
  /** Emoji representing the question theme */
  icon: string;
  /** index 0 = #1 in the world = the correct answer */
  ranking: RankedCountry[];
}

export interface GuessResult {
  tier: Tier;
  /** 1-based rank; null if iso3 not in ranking */
  rank: number | null;
  /** Raw value for the guessed country; null if not in ranking */
  value: number | null;
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
  icon: string;
  // ranking deliberately omitted — it's the answer
}

export interface TodayStatsResponse {
  plays: number;
  bullseyeRate: number;
  avgGuesses: number;
  /** Full ranking revealed once the game is over */
  ranking: RankedCountry[];
}

export interface GameInfo {
  id: string;
  title: string;
  tagline: string;
  enabled: boolean;
}

export interface GeoplacePuzzle {
  referenceIso3: string;
  rounds: Array<{ targetIso3: string }>;
}

export interface GeoplaceStatsResponse {
  plays: number;
  avgScore: number;
}
