import type { GeoplacePuzzle } from '@shared/types';

/** Every Placle session key starts with this; each puzzle's session has its own key. */
export const SESSION_KEY_PREFIX = 'geogames:geoplace:session:';

/** The storage key for one day's puzzle, so another day's or puzzle's session is never read. */
export function puzzleKey(date: string, puzzle: GeoplacePuzzle): string {
  const iso3s = [puzzle.referenceIso3, ...puzzle.rounds.map((r) => r.targetIso3)];
  return `${SESSION_KEY_PREFIX}${date}:${iso3s.join('-')}`;
}

/** The parts of a saved session that must agree with the puzzle and with each other. */
interface SessionProgress {
  roundIndex: number;
  phase: 'placing' | 'placed' | 'results';
  placedCountries: Array<{ iso3: string }>;
  scores: number[];
}

/**
 * Whether a saved session is one this puzzle could have produced. Each round adds one
 * placement and one score, in target order, so a hand-edited session that fails this
 * would draw a country the globe has no data for, show "undefined%" or place twice.
 */
export function isRestorable(session: SessionProgress, puzzle: GeoplacePuzzle): boolean {
  const placed = session.phase === 'placing' ? session.roundIndex : session.roundIndex + 1;
  return session.placedCountries.length === placed && session.scores.length === placed
    && session.placedCountries.every((p, i) => p.iso3 === puzzle.rounds[i]?.targetIso3);
}
