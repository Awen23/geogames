import { describe, expect, it } from 'vitest';
import { loadQuestionData } from '../src/data/csvLoader';

describe('loadQuestionData', () => {
  it('ranks recognised countries and excludes aggregate or territory codes', () => {
    const data = loadQuestionData('meat-supply-per-person.csv', 2023);
    const rankedIso3s = new Set(data.ranking.map((country) => country.iso3));

    expect(rankedIso3s.has('SYC')).toBe(true);
    expect(rankedIso3s.has('TWN')).toBe(true);
    expect(rankedIso3s.has('HKG')).toBe(false);
    expect(rankedIso3s.has('OWID_WRL')).toBe(false);
    expect(data.coveredIsoCodes).toContain('HKG');
  });
});
