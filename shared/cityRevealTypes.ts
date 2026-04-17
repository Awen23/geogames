export interface CityRevealLandmark {
  /** Safe internal label — must not contain the city name */
  label: string;
  lat: number;
  lon: number;
  /** English Wikipedia article title for thumbnail fetch */
  wikiTitle: string;
}

export interface CityRevealCity {
  id: string;
  name: string;
  country: string;
  /** ISO 3166-1 alpha-2, used to derive the flag emoji */
  countryCode: string;
  lat: number;
  lon: number;
  /** Locked map zoom level for this city (typically 11–13) */
  zoom: number;
  landmarks: CityRevealLandmark[];
  /**
   * When true this city enters the daily puzzle rotation.
   * Cities without this flag are still searchable/guessable but
   * never appear as the daily answer.
   */
  implemented?: boolean;
}

export const MAX_GUESSES = 5;

/** Converts an ISO 3166-1 alpha-2 code to a flag emoji (e.g. "CH" → "🇨🇭") */
export function flagEmoji(countryCode: string): string {
  const offset = 0x1F1E6 - 65; // regional indicator 'A' is U+1F1E6; 'A'.charCodeAt(0) = 65
  return [...countryCode.toUpperCase()]
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + offset))
    .join('');
}

/** Converts a bearing in degrees [0, 360) to a compass arrow emoji */
export function bearingToArrow(bearing: number): string {
  const arrows = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
  return arrows[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

export interface CityRevealTodayResponse {
  date: string;
  /** City id — present so the client can look up landmarks client-side */
  cityId: string;
  lat: number;
  lon: number;
  zoom: number;
}

export interface CityRevealGuessResponse {
  correct: boolean;
  /** Distance from guessed city to the correct city, in km. Present when correct = false. */
  distanceKm?: number;
  /** Bearing from guessed city to correct city, in degrees [0, 360). Present when correct = false. */
  bearing?: number;
  /** Full city object — only present when correct = true */
  city?: CityRevealCity;
}

export interface CityRevealResultRequest {
  won: boolean;
  guesses: number;
}
