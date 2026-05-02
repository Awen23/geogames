export const TEXT_MATCH_RANK = {
  exact: 0,
  prefix: 1,
  substring: 2,
  sequential: 3,
} as const;

export type TextMatchKind = keyof typeof TEXT_MATCH_RANK;

export interface NormalisedText {
  value: string;
  sourceIndices: number[];
}

export interface TextMatch {
  kind: TextMatchKind;
  rank: number;
  sourceIndices: number[];
}

export interface TextValueMatch extends TextMatch {
  valueIndex: number;
}

export function normaliseSearchTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normaliseTextWithIndices(value: string): NormalisedText {
  const chars: string[] = [];
  const sourceIndices: number[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const normalised = normaliseSearchTerm(value[i]);
    for (const char of normalised) {
      chars.push(char);
      sourceIndices.push(i);
    }
  }

  return {
    value: chars.join(''),
    sourceIndices,
  };
}

function contiguousMatchIndices(text: NormalisedText, query: string, startIndex: number): number[] {
  return text.sourceIndices.slice(startIndex, startIndex + query.length);
}

function findSequentialMatchIndices(text: NormalisedText, query: string): number[] | null {
  const matchIndices: number[] = [];
  let nextQueryIndex = 0;

  for (let i = 0; i < text.value.length && nextQueryIndex < query.length; i += 1) {
    if (text.value[i] === query[nextQueryIndex]) {
      matchIndices.push(text.sourceIndices[i]);
      nextQueryIndex += 1;
    }
  }

  if (nextQueryIndex !== query.length) {
    return null;
  }

  return matchIndices;
}

export function findTextMatch(value: string, normalisedQuery: string): TextMatch | null {
  if (!normalisedQuery) {
    return null;
  }

  const text = normaliseTextWithIndices(value);
  if (!text.value) {
    return null;
  }

  if (text.value === normalisedQuery) {
    return {
      kind: 'exact',
      rank: TEXT_MATCH_RANK.exact,
      sourceIndices: contiguousMatchIndices(text, normalisedQuery, 0),
    };
  }

  if (text.value.startsWith(normalisedQuery)) {
    return {
      kind: 'prefix',
      rank: TEXT_MATCH_RANK.prefix,
      sourceIndices: contiguousMatchIndices(text, normalisedQuery, 0),
    };
  }

  const substringIndex = text.value.indexOf(normalisedQuery);
  if (substringIndex !== -1) {
    return {
      kind: 'substring',
      rank: TEXT_MATCH_RANK.substring,
      sourceIndices: contiguousMatchIndices(text, normalisedQuery, substringIndex),
    };
  }

  const sequentialIndices = findSequentialMatchIndices(text, normalisedQuery);
  if (sequentialIndices) {
    return {
      kind: 'sequential',
      rank: TEXT_MATCH_RANK.sequential,
      sourceIndices: sequentialIndices,
    };
  }

  return null;
}

export function findBestTextMatch(values: string[], normalisedQuery: string): TextValueMatch | null {
  let bestMatch: TextValueMatch | null = null;

  values.forEach((value, valueIndex) => {
    const match = findTextMatch(value, normalisedQuery);
    if (!match) {
      return;
    }

    if (!bestMatch || match.rank < bestMatch.rank) {
      bestMatch = {
        ...match,
        valueIndex,
      };
    }
  });

  return bestMatch;
}
