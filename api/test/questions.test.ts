import { describe, expect, it } from 'vitest';
import type { Question } from '@shared/types';
import { COUNTRIES } from '@shared/guessCountries';
import { countRankedCountriesByYear } from '../src/data/csvLoader';
import {
  questionConfigs,
  questions,
  type QuestionConfig,
  type QuestionDataCheck,
} from '../src/data/questions';

/**
 * Data checks for every Mostle question. They loop over the real question list, so a newly
 * added question is checked without writing any new test. A question can skip a check only by
 * giving a reason in its config's `knownDataIssues`, and that exemption fails once the
 * problem is gone, so it can't be left behind.
 */

const TOP_N = 5;
/** A question's year must have at least this share of the countries in its CSV's best-covered year. */
const MIN_COVERAGE_SHARE = 0.85;

const COUNTRY_NAMES = new Map(COUNTRIES.map((country) => [country.iso3, country.name]));
const currentYear = new Date().getUTCFullYear();

const cases = questionConfigs.map((config, index) => ({ config, question: questions[index] }));

/** Checks that a question can opt out of. Each returns whether the question passes, and why not. */
const exemptableChecks: Record<
  QuestionDataCheck,
  { title: string; run: (config: QuestionConfig, question: Question) => { pass: boolean; detail: string } }
> = {
  coverage: {
    title: `covers at least ${MIN_COVERAGE_SHARE * 100}% of the countries in the CSV's best-covered year`,
    run: (config, question) => {
      const counts = countRankedCountriesByYear(config.csvFile, { valueColumn: config.valueColumn });
      const pastCounts = Array.from(counts).filter(([year]) => year <= currentYear).map(([, count]) => count);
      const bestCount = Math.max(0, ...pastCounts);
      const needed = Math.ceil(bestCount * MIN_COVERAGE_SHARE);
      return {
        pass: bestCount > 0 && question.ranking.length >= needed,
        detail: `${question.ranking.length} countries, needs ${needed} (best year has ${bestCount})`,
      };
    },
  },
  tieAtFifth: {
    // With a tie, which countries count as the top 5 depends on the order of rows in the CSV.
    title: `has no tie between #${TOP_N} and #${TOP_N + 1}`,
    run: (_config, question) => {
      const fifth = question.ranking[TOP_N - 1]?.value;
      const sixth = question.ranking[TOP_N]?.value;
      return { pass: fifth !== sixth, detail: `#${TOP_N} is ${fifth}, #${TOP_N + 1} is ${sixth}` };
    },
  },
};

describe('Mostle question data', () => {
  it('has a unique id for every question', () => {
    const ids = questionConfigs.map((config) => config.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  describe.each(cases)('$config.id', ({ config, question }) => {
    it(`ranks at least ${TOP_N} countries`, () => {
      // An empty ranking usually means the year or value column isn't in the CSV.
      expect(question.ranking.length).toBeGreaterThanOrEqual(TOP_N);
    });

    for (const [check, { title, run }] of Object.entries(exemptableChecks) as [QuestionDataCheck, (typeof exemptableChecks)[QuestionDataCheck]][]) {
      const knownIssue = config.knownDataIssues?.[check];

      if (knownIssue) {
        it(`known issue, still present: ${title} (${knownIssue})`, () => {
          const { pass } = run(config, question);
          expect(pass, `Fixed: remove knownDataIssues.${check} from ${config.id}`).toBe(false);
        });
      } else {
        it(title, () => {
          const { pass, detail } = run(config, question);
          expect(pass, detail).toBe(true);
        });
      }
    }

    it('has an id without a year in it', () => {
      // The schedule stores ids, so an id must stay the same when the question's data year changes.
      expect(config.id).not.toMatch(/(19|20)\d\d/);
    });

    it('links to the same chart and year as its CSV', () => {
      const slug = config.csvFile.replace(/\.csv$/, '');

      for (const url of [config.sourceUrl, config.mapEmbedUrl]) {
        const parsed = new URL(url);
        expect(parsed.pathname).toBe(`/grapher/${slug}`);
        expect(parsed.searchParams.get('time')).toBe(String(config.year));
      }
    });

    it('does not use a year in the future', () => {
      expect(config.year).toBeLessThanOrEqual(currentYear);
    });
  });

  it('matches the reviewed list of questions and their top 5s', async () => {
    // Any change to the question list or its data changes this file. Review the diff, then
    // update it with `npx vitest run -u`.
    const summary = questions
      .map((question, index) => {
        const top = question.ranking
          .slice(0, TOP_N)
          .map((country) => `${COUNTRY_NAMES.get(country.iso3) ?? country.iso3} (${country.value})`)
          .join(', ');
        return `${index}. ${question.id}: ${question.ranking.length} countries\n   ${top}`;
      })
      .join('\n');

    await expect(`${summary}\n`).toMatchFileSnapshot('./__snapshots__/mostle-questions.txt');
  });
});
