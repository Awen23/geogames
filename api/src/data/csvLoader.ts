import fs from 'fs';
import path from 'path';
import type { RankedCountry } from '@shared/types';

const CSV_DIR =
  process.env.NODE_ENV === 'production'
    ? path.join(process.cwd(), 'data', 'csv')
    : path.join(process.cwd(), 'src', 'data', 'csv');

/**
 * Parses an OWID-format CSV (Entity, Code, Year, Value) and returns all
 * countries ranked by value for the given year, descending, excluding zeros.
 * Entries without a 3-letter ISO code are regional aggregates and are skipped.
 */
export function loadRanking(csvFile: string, year: number): RankedCountry[] {
  const raw = fs.readFileSync(path.join(CSV_DIR, csvFile), 'utf-8');
  const lines = raw.split('\n').slice(1); // skip header

  const rows: RankedCountry[] = [];
  for (const line of lines) {
    if (!line.trim()) { continue; }

    // OWID CSVs quote fields that contain commas; value is always the last field
    const lastComma = line.lastIndexOf(',');
    const prefix = line.slice(0, lastComma);
    const valueStr = line.slice(lastComma + 1).trim();

    const secondComma = prefix.indexOf(',', prefix.indexOf(',') + 1);
    const iso3 = prefix.slice(prefix.indexOf(',') + 1, secondComma).trim().replace(/"/g, '');
    const yearStr = prefix.slice(secondComma + 1).trim().replace(/"/g, '');

    if (iso3.length !== 3 || parseInt(yearStr, 10) !== year) { continue; }

    const value = parseFloat(valueStr);
    if (!isFinite(value) || value <= 0) { continue; }

    rows.push({ iso3, value: Math.round(value * 1000) / 1000 });
  }

  return rows.sort((a, b) => b.value - a.value);
}
