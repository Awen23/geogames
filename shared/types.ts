/** `found` = one of the top 5; `warm` = in the broader ranking; `cold` = not ranked */
export type Tier = 'found' | 'warm' | 'cold';

export interface RankedCountry {
  iso3: string;
  value: number;
}

export interface Question {
  id: string;
  prompt: string;
  /** One-sentence description of the exact metric being measured, from the data source */
  description: string;
  metric: string;
  unit: string;
  source: string;
  sourceUrl: string;
  /** Emoji representing the question theme */
  icon: string;
  /** OWID embed URL shown as a choropleth map on the end screen */
  mapEmbedUrl: string;
  /** index 0 = #1 in the world; top 5 are the collective "correct answers" */
  ranking: RankedCountry[];
}

export interface GuessResult {
  tier: Tier;
  /** 1-based rank in the full ranking; null if not ranked */
  rank: number | null;
  /** Raw value for the guessed country; null if not ranked */
  value: number | null;
  /** True when the guessed country is one of the top 5 */
  isTopFive: boolean;
}

export interface TodayResponse {
  id: string;
  date: string;
  prompt: string;
  description: string;
  metric: string;
  unit: string;
  source: string;
  sourceUrl: string;
  icon: string;
  /** Sum of top-5 values — used by client to calculate progress bar % */
  maxScore: number;
  /** OWID embed URL for the post-game choropleth map */
  mapEmbedUrl: string;
  // ranking deliberately omitted — it's the answer
}

export interface WhereMostStatsResponse {
  plays: number;
  /** Average % of total top-5 metric value achieved across all plays today */
  avgScore: number;
  avgGuesses: number;
  /** Full ranking revealed once the game is over */
  ranking: RankedCountry[];
}

export interface CityRevealStatsResponse {
  plays: number;
  winRate: number;
  avgGuesses: number;
}

export interface GameInfo {
  id: string;
  title: string;
  icon: string;
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

export interface GeoplacePlacement {
  targetIso3: string;
  clickLat: number;
  clickLon: number;
  score: number;
}
