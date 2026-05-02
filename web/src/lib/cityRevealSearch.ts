import type { CityRevealCity } from '@shared/cityRevealTypes';
import { findTextMatch, normaliseSearchTerm } from '@shared/textMatcher';
import type { TextMatch } from '@shared/textMatcher';

export interface CityRevealSearchResult {
  city: CityRevealCity;
  cityMatchIndices: Set<number>;
  countryMatchIndices: Set<number>;
}

export function searchCityRevealCities(
  cities: CityRevealCity[],
  query: string,
  guessedIds: Set<string>,
  limit = 8,
): CityRevealSearchResult[] {
  const q = normaliseSearchTerm(query);
  if (!q) {
    return [];
  }

  return cities
    .filter((city) => !guessedIds.has(city.id))
    .map((city) => {
      const cityMatch = findTextMatch(city.name, q);
      const countryMatch = findTextMatch(city.country, q);
      const bestMatch = [cityMatch, countryMatch]
        .filter((match): match is TextMatch => Boolean(match))
        .sort((a, b) => a.rank - b.rank)[0];

      if (!bestMatch) {
        return null;
      }

      return {
        city,
        rank: bestMatch.rank,
        cityMatchIndices: new Set(cityMatch?.sourceIndices ?? []),
        countryMatchIndices: new Set(countryMatch?.sourceIndices ?? []),
      };
    })
    .filter((result): result is CityRevealSearchResult & { rank: number } => Boolean(result))
    .sort((a, b) => a.rank - b.rank || a.city.name.localeCompare(b.city.name))
    .slice(0, limit)
    .map(({ city, cityMatchIndices, countryMatchIndices }) => ({
      city,
      cityMatchIndices,
      countryMatchIndices,
    }));
}
