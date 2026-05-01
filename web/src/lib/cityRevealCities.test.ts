import { describe, expect, it } from 'vitest';
import { CITY_REVEAL_CITIES } from '@shared/cityRevealCities';
import { haversineKm } from '@shared/distance';
import { COUNTRIES } from '@shared/guessCountries';

const MAPLE_COUNTRY_NAME_ALIASES: Record<string, string> = {
  Czechia: 'Czech Republic',
  'Democratic Republic of the Congo': 'DR Congo',
  'Ivory Coast': 'Côte d\'Ivoire',
  'United Arab Emirates': 'UAE',
};

describe('city reveal cities', () => {
  it('uses unique city ids', () => {
    const ids = CITY_REVEAL_CITIES.map((city) => city.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps each city guessable with a flag and three landmarks', () => {
    for (const city of CITY_REVEAL_CITIES) {
      expect(city.countryCode, city.name).toMatch(/^[A-Z]{2}$/);
      expect(city.landmarks, city.name).toHaveLength(3);
    }
  });

  it('keeps landmarks close enough for the locked map view', () => {
    for (const city of CITY_REVEAL_CITIES) {
      for (const landmark of city.landmarks) {
        expect(haversineKm(city, landmark), `${city.name}: ${landmark.label}`).toBeLessThanOrEqual(25);
      }
    }
  });

  it('includes every recognised country as a Maple guess', () => {
    const countries = new Set(CITY_REVEAL_CITIES.map((city) => city.country));
    const missingCountries = COUNTRIES
      .filter((country) => !countries.has(MAPLE_COUNTRY_NAME_ALIASES[country.name] ?? country.name))
      .map((country) => country.name);

    expect(missingCountries).toEqual([]);
  });
});
