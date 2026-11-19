import fs from 'fs';
import path from 'path';
import type { RankedCountry } from '@shared/types';
import { VALID_COUNTRY_ISO3S } from '../../../shared/countryIso3';

const CSV_DIR =
  process.env.NODE_ENV === 'production'
    ? path.join(process.cwd(), 'data', 'csv')
    : path.resolve(__dirname, 'csv');

export interface QuestionData {
  ranking: RankedCountry[];
  /** ISO3 codes with any numeric value for this year in the CSV (including zero), before country filtering. */
  coveredIsoCodes: string[];
}

export interface LoadQuestionDataOptions {
  /** Defaults to the first column after Year, which is the metric column for standard OWID grapher CSVs. */
  valueColumn?: string;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

interface CsvRow {
  iso3: string;
  year: number;
  value: number;
}

/**
 * Parses an OWID-format CSV (Entity, Code, Year, value column, optional metadata columns).
 * Returns every row with a 3-letter code, a year and a finite value, for all years.
 */
function readCsvRows(csvFile: string, options: LoadQuestionDataOptions): CsvRow[] {
  const raw = fs.readFileSync(path.join(CSV_DIR, csvFile), 'utf-8');
  const [headerLine, ...lines] = raw.split('\n');
  const header = parseCsvLine(headerLine);
  const codeIndex = header.indexOf('Code');
  const yearIndex = header.indexOf('Year');
  const valueIndex = options.valueColumn ? header.indexOf(options.valueColumn) : yearIndex + 1;

  if (codeIndex === -1 || yearIndex === -1 || valueIndex === -1) {
    throw new Error(`Unsupported OWID CSV shape in ${csvFile}`);
  }

  const rows: CsvRow[] = [];

  for (const line of lines) {
    if (!line.trim()) { continue; }

    const cells = parseCsvLine(line);
    const iso3 = cells[codeIndex]?.trim().toUpperCase() ?? '';
    const year = parseInt(cells[yearIndex]?.trim() ?? '', 10);
    const value = parseFloat(cells[valueIndex]?.trim() ?? '');

    if (iso3.length !== 3 || !Number.isInteger(year) || !isFinite(value)) { continue; }

    rows.push({ iso3, year, value });
  }

  return rows;
}

/**
 * Loads one year of an OWID-format CSV.
 * Ranking: recognised countries only, finite values, sorted descending.
 * coveredIsoCodes: every 3-letter code with a finite value for that year (used for cold vs no-data).
 */
export function loadQuestionData(
  csvFile: string,
  year: number,
  options: LoadQuestionDataOptions = {},
): QuestionData {
  const ranking: RankedCountry[] = [];
  const covered = new Set<string>();

  for (const row of readCsvRows(csvFile, options)) {
    if (row.year !== year) { continue; }

    covered.add(row.iso3);

    if (VALID_COUNTRY_ISO3S.has(row.iso3)) {
      ranking.push({ iso3: row.iso3, value: Math.round(row.value * 1000) / 1000 });
    }
  }

  ranking.sort((a, b) => b.value - a.value);
  const coveredIsoCodes = Array.from(covered).sort();

  return { ranking, coveredIsoCodes };
}

/**
 * For each year in an OWID-format CSV, how many recognised countries have a value.
 * Used by the question-data tests to compare a question's year with the CSV's best-covered year.
 */
export function countRankedCountriesByYear(
  csvFile: string,
  options: LoadQuestionDataOptions = {},
): Map<number, number> {
  const countriesByYear = new Map<number, Set<string>>();

  for (const row of readCsvRows(csvFile, options)) {
    if (!VALID_COUNTRY_ISO3S.has(row.iso3)) { continue; }

    const countries = countriesByYear.get(row.year) ?? new Set<string>();
    countries.add(row.iso3);
    countriesByYear.set(row.year, countries);
  }

  return new Map(Array.from(countriesByYear, ([year, countries]) => [year, countries.size]));
}
