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

/**
 * Parses an OWID-format CSV (Entity, Code, Year, value column, optional metadata columns) for one year.
 * Ranking: recognised countries only, value > 0, sorted descending.
 * coveredIsoCodes: every 3-letter code with a finite value for that year (used for cold vs no-data).
 */
export function loadQuestionData(
  csvFile: string,
  year: number,
  options: LoadQuestionDataOptions = {},
): QuestionData {
  const raw = fs.readFileSync(path.join(CSV_DIR, csvFile), 'utf-8');
  const [headerLine, ...lines] = raw.split('\n');
  const header = parseCsvLine(headerLine);
  const codeIndex = header.indexOf('Code');
  const yearIndex = header.indexOf('Year');
  const valueIndex = options.valueColumn ? header.indexOf(options.valueColumn) : yearIndex + 1;

  if (codeIndex === -1 || yearIndex === -1 || valueIndex === -1) {
    throw new Error(`Unsupported OWID CSV shape in ${csvFile}`);
  }

  const rows: RankedCountry[] = [];
  const covered = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) { continue; }

    const cells = parseCsvLine(line);
    const iso3 = cells[codeIndex]?.trim().toUpperCase() ?? '';
    const yearStr = cells[yearIndex]?.trim() ?? '';
    const valueStr = cells[valueIndex]?.trim() ?? '';

    if (iso3.length !== 3 || parseInt(yearStr, 10) !== year) { continue; }

    const value = parseFloat(valueStr);
    if (!isFinite(value)) { continue; }

    covered.add(iso3);

    if (value > 0 && VALID_COUNTRY_ISO3S.has(iso3)) {
      rows.push({ iso3, value: Math.round(value * 1000) / 1000 });
    }
  }

  rows.sort((a, b) => b.value - a.value);
  const coveredIsoCodes = Array.from(covered).sort();

  return { ranking: rows, coveredIsoCodes };
}
