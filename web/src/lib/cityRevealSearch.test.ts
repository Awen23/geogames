import { describe, expect, it } from 'vitest';
import type { CityRevealCity } from '@shared/cityRevealTypes';
import { searchCityRevealCities } from './cityRevealSearch';

function city(id: string, name: string, country: string): CityRevealCity {
  return {
    id,
    name,
    country,
    countryCode: 'GB',
    lat: 0,
    lon: 0,
    zoom: 10,
    landmarks: [
      { label: 'One', lat: 0, lon: 0, wikiTitle: 'One' },
      { label: 'Two', lat: 0, lon: 0, wikiTitle: 'Two' },
      { label: 'Three', lat: 0, lon: 0, wikiTitle: 'Three' },
    ],
  };
}

describe('city reveal search', () => {
  it('matches with arbitrary characters between typed characters', () => {
    const results = searchCityRevealCities(
      [city('syria-city', 'Homs', 'Syria')],
      'sya',
      new Set(),
    );

    expect(results[0]?.city.id).toBe('syria-city');
    expect([...results[0].countryMatchIndices]).toEqual([0, 1, 4]);
  });

  it('keeps contiguous matches ahead of loose sequential matches', () => {
    const results = searchCityRevealCities(
      [
        city('sequential', 'Sylvania', 'Exampleland'),
        city('prefix', 'Sya', 'Exampleland'),
        city('substring', 'Asya', 'Exampleland'),
      ],
      'sya',
      new Set(),
    );

    expect(results.map((result) => result.city.id)).toEqual(['prefix', 'substring', 'sequential']);
  });

  it('normalises accents when matching and highlighting', () => {
    const results = searchCityRevealCities(
      [city('sao-paulo', 'São Paulo', 'Brazil')],
      'sao',
      new Set(),
    );

    expect(results[0]?.city.id).toBe('sao-paulo');
    expect([...results[0].cityMatchIndices]).toEqual([0, 1, 2]);
  });
});
