import fs from 'fs';
import path from 'path';
import type { RankedCountry } from '@shared/types';
import { UN_MEMBER_ISO3 } from './unMemberIsoCodes';

const CSV_DIR =
  process.env.NODE_ENV === 'production'
    ? path.join(process.cwd(), 'data', 'csv')
    : path.resolve(__dirname, 'csv');

export interface QuestionData {
  ranking: RankedCountry[];
  /** ISO3 codes with any numeric value for this year in the CSV (including zero), before UN filtering. */
  coveredIsoCodes: string[];
}

/**
 * Parses an OWID-format CSV (Entity, Code, Year, value in last column) for one year.
 * Ranking: UN members only, value > 0, sorted descending.
 * coveredIsoCodes: every 3-letter code with a finite value for that year (used for cold vs no-data).
 */
export function loadQuestionData(csvFile: string, year: number): QuestionData {
  const raw = fs.readFileSync(path.join(CSV_DIR, csvFile), 'utf-8');
  const lines = raw.split('\n').slice(1); // skip header

  const rows: RankedCountry[] = [];
  const covered = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) { continue; }

    const lastComma = line.lastIndexOf(',');
    const prefix = line.slice(0, lastComma);
    const valueStr = line.slice(lastComma + 1).trim();

    const secondComma = prefix.indexOf(',', prefix.indexOf(',') + 1);
    const iso3 = prefix
      .slice(prefix.indexOf(',') + 1, secondComma)
      .trim()
      .replace(/"/g, '')
      .toUpperCase();
    const yearStr = prefix.slice(secondComma + 1).trim().replace(/"/g, '');

    if (iso3.length !== 3 || parseInt(yearStr, 10) !== year) { continue; }

    const value = parseFloat(valueStr);
    if (!isFinite(value)) { continue; }

    covered.add(iso3);

    if (value > 0 && UN_MEMBER_ISO3.has(iso3)) {
      rows.push({ iso3, value: Math.round(value * 1000) / 1000 });
    }
  }

  rows.sort((a, b) => b.value - a.value);
  const coveredIsoCodes = Array.from(covered).sort();

  return { ranking: rows, coveredIsoCodes };
}
