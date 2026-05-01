import { describe, expect, it } from 'vitest';
import { COUNTRIES, searchCountries } from '@shared/guessCountries';
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
});
