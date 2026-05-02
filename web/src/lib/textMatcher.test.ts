import { describe, expect, it } from 'vitest';
import { findBestTextMatch, findTextMatch, normaliseSearchTerm } from '@shared/textMatcher';

describe('text matcher', () => {
  it('normalises accents, punctuation, and case', () => {
    expect(normaliseSearchTerm("São Tomé & PRÍNCIPE")).toBe('saotomeprincipe');
  });

  it('ranks exact, prefix, substring, then sequential matches', () => {
    expect(findTextMatch('Sya', 'sya')?.kind).toBe('exact');
    expect(findTextMatch('Syria', 'syr')?.kind).toBe('prefix');
    expect(findTextMatch('Asya', 'sya')?.kind).toBe('substring');
    expect(findTextMatch('Sylvania', 'sya')?.kind).toBe('sequential');
  });

  it('returns source indices for bolding loose sequential matches', () => {
    expect(findTextMatch('Sylvania', 'sya')?.sourceIndices).toEqual([0, 1, 4]);
  });

  it('selects the best ranked match across searchable values', () => {
    const match = findBestTextMatch(['Sylvania', 'Sya'], 'sya');

    expect(match?.kind).toBe('exact');
    expect(match?.valueIndex).toBe(1);
    expect(match?.sourceIndices).toEqual([0, 1, 2]);
  });
});
