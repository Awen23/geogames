import { describe, expect, it } from 'vitest';
import { COUNTRIES, searchCountries, searchCountryMatches } from '@shared/guessCountries';
import { VALID_COUNTRY_ISO3S } from '@shared/countryIso3';

describe('guess countries', () => {
  it('contains the 197 recognised countries used by Mostle', () => {
    expect(COUNTRIES).toHaveLength(197);
    expect(VALID_COUNTRY_ISO3S.size).toBe(197);
    expect(VALID_COUNTRY_ISO3S).toEqual(new Set(COUNTRIES.map((country) => country.iso3)));
  });

  it('includes recognised countries that were easy to miss in hand-maintained lists', () => {
    expect(VALID_COUNTRY_ISO3S.has('DMA')).toBe(true);
    expect(VALID_COUNTRY_ISO3S.has('SYC')).toBe(true);
    expect(VALID_COUNTRY_ISO3S.has('PSE')).toBe(true);
    expect(VALID_COUNTRY_ISO3S.has('VAT')).toBe(true);
    expect(VALID_COUNTRY_ISO3S.has('XKX')).toBe(true);
  });

  it('finds Liechtenstein despite a rough misspelling', () => {
    expect(searchCountries('lichsteinstein')[0]?.iso3).toBe('LIE');
  });

  it('normalises accents when searching', () => {
    expect(searchCountries('sao tome')[0]?.iso3).toBe('STP');
  });

  it('prioritises exact alias matches', () => {
    expect(searchCountries('USA')[0]?.iso3).toBe('USA');
    expect(searchCountries('UAE')[0]?.iso3).toBe('ARE');
  });

  it('matches country names with arbitrary characters between typed characters', () => {
    const result = searchCountryMatches('sya').find((match) => match.country.iso3 === 'SYR');

    expect(result?.country.name).toBe('Syria');
    expect(result ? [...result.nameMatchIndices] : []).toEqual([0, 1, 4]);
  });

  it('keeps typo matches after ranked text matches', () => {
    const results = searchCountries('lichsteinstein');

    expect(results[0]?.iso3).toBe('LIE');
    expect(results.findIndex((country) => country.iso3 === 'LIE')).toBeGreaterThanOrEqual(0);
  });
});
