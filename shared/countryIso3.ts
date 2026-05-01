import { COUNTRIES } from './guessCountries';

export const VALID_COUNTRY_ISO3S = new Set(COUNTRIES.map((country) => country.iso3));
