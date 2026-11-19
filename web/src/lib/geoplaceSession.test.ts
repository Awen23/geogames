import { describe, expect, it } from 'vitest';
import type { GeoplacePuzzle } from '@shared/types';
import { isRestorable, puzzleKey } from './geoplaceSession';

const PUZZLE: GeoplacePuzzle = {
  referenceIso3: 'MAR',
  rounds: [{ targetIso3: 'ALB' }, { targetIso3: 'CYP' }, { targetIso3: 'UKR' }],
};

function session(
  roundIndex: number,
  phase: 'placing' | 'placed' | 'results',
  placedIso3s: string[],
  scores = placedIso3s.map(() => 50),
) {
  return { roundIndex, phase, placedCountries: placedIso3s.map((iso3) => ({ iso3 })), scores };
}

describe('puzzleKey', () => {
  it('names the date, reference and targets in order', () => {
    expect(puzzleKey('2026-11-19', PUZZLE)).toBe('geogames:geoplace:session:2026-11-19:MAR-ALB-CYP-UKR');
  });
});

describe('isRestorable', () => {
  it.each([
    ['placing round 1', session(0, 'placing', [])],
    ['placed round 1', session(0, 'placed', ['ALB'])],
    ['placing round 2', session(1, 'placing', ['ALB'])],
    ['placed round 2', session(1, 'placed', ['ALB', 'CYP'])],
    ['placing round 3', session(2, 'placing', ['ALB', 'CYP'])],
    ['placed round 3', session(2, 'placed', ['ALB', 'CYP', 'UKR'])],
    ['results', session(2, 'results', ['ALB', 'CYP', 'UKR'])],
  ])('accepts a session %s', (_, s) => {
    expect(isRestorable(s, PUZZLE)).toBe(true);
  });

  it('rejects a placed country that is not the target', () => {
    expect(isRestorable(session(1, 'placing', ['TZA']), PUZZLE)).toBe(false);
  });

  it('rejects targets placed out of order', () => {
    expect(isRestorable(session(1, 'placed', ['CYP', 'ALB']), PUZZLE)).toBe(false);
  });

  it('rejects placements that do not match the round and phase', () => {
    expect(isRestorable(session(1, 'placing', []), PUZZLE)).toBe(false);
    expect(isRestorable(session(0, 'placing', ['ALB']), PUZZLE)).toBe(false);
  });

  it('rejects scores that do not match the placements', () => {
    expect(isRestorable(session(1, 'placing', ['ALB'], []), PUZZLE)).toBe(false);
    expect(isRestorable(session(1, 'placing', ['ALB'], [50, 50]), PUZZLE)).toBe(false);
  });
});
