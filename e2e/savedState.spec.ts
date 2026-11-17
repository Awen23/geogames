import { test, expect, type Page } from '@playwright/test';
import { MOSTLE } from './support/knownPuzzles';

// Each test gets a fresh browser context, so storage starts empty. Seeds go in with
// addInitScript, which re-runs on every navigation: tests that reload seed once only.

async function seed(page: Page, entries: Record<string, string>) {
  await page.addInitScript((e) => {
    for (const [key, value] of Object.entries(e)) {
      localStorage.setItem(key, value);
    }
  }, entries);
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function junkSeeds(kind: 'invalid-json' | 'wrong-shape'): Record<string, string> {
  const today = utcToday();
  if (kind === 'invalid-json') {
    return {
      'geogames:where-most:state': '{not json',
      [`geogames:where-most:progress:${today}`]: '{not json',
      'geogames:geoplace:state': '{not json',
      'geogames:geoplace:session': '{not json',
      'geogames:city-reveal:state': '{not json',
      [`geogames:city-reveal:game:${today}`]: '{not json',
    };
  }
  return {
    'geogames:where-most:state': JSON.stringify({ history: 5 }),
    [`geogames:where-most:progress:${today}`]: JSON.stringify({
      date: today, questionId: 7, guesses: [{ iso3: 'DEU', result: 'found' }], noDataIso3s: null,
    }),
    'geogames:geoplace:state': 'null',
    'geogames:geoplace:session': JSON.stringify({
      date: today, roundIndex: 'x', phase: 'placing', placedCountries: null, scores: null,
    }),
    'geogames:city-reveal:state': JSON.stringify({ history: [{ date: today, won: 'yes' }, 'junk'] }),
    [`geogames:city-reveal:game:${today}`]: JSON.stringify({
      date: today, guesses: 'nope', won: false, gameOver: false,
    }),
  };
}

const PAGES: Array<{ name: string; path: string; ready: (page: Page) => Promise<void> }> = [
  {
    name: 'hub',
    path: '/',
    ready: async (page) => { await expect(page.getByText('Mostle')).toBeVisible(); },
  },
  {
    name: 'Mostle',
    path: '/games/where-most',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(MOSTLE.prompt);
      await expect(page.getByTestId('country-input')).toBeVisible();
      await expect(page.getByTestId('guess-counter')).toHaveText('Guess 1 of 5');
    },
  },
  {
    name: 'Placle',
    path: '/games/geoplace',
    ready: async (page) => { await expect(page.getByText('Round 1 of 3')).toBeVisible(); },
  },
  {
    name: 'Maple',
    path: '/games/city-reveal',
    ready: async (page) => { await expect(page.getByRole('button', { name: 'Start playing' })).toBeVisible(); },
  },
];

test.describe('Corrupt saved progress', () => {
  for (const kind of ['invalid-json', 'wrong-shape'] as const) {
    for (const p of PAGES) {
      test(`${p.name} loads a fresh game over ${kind} data`, async ({ page }) => {
        await seed(page, junkSeeds(kind));
        await page.goto(p.path);
        await p.ready(page);
      });
    }
  }
});

test.describe('Placle saved session', () => {
  test('a session for a different puzzle is discarded', async ({ page }) => {
    await seed(page, {
      'geogames:geoplace:session': JSON.stringify({
        date: utcToday(),
        referenceIso3: 'XXX',
        targetIso3s: ['YYY', 'ZZZ', 'QQQ'],
        roundIndex: 1,
        phase: 'placing',
        placedCountries: [{ iso3: 'YYY', lat: 0, lon: 0, label: '50%' }],
        scores: [50],
      }),
    });
    await page.goto('/games/geoplace');
    await expect(page.getByText('Round 1 of 3')).toBeVisible();
  });

  test('a mid-game session restores after reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/games/geoplace');
    await expect(page.getByTestId('globe-place-target')).toBeVisible();
    const box = await page.getByTestId('globe').boundingBox();
    if (!box) {
      throw new Error('Globe should have a bounding box');
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByText('Round 2 of 3')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Round 2 of 3')).toBeVisible();
  });
});

test.describe('Maple saved games', () => {
  test('old per-date keys are pruned, history is kept', async ({ page }) => {
    const history = JSON.stringify({ history: [{ date: '2020-01-01', won: true, guesses: 3 }] });
    await seed(page, {
      'geogames:city-reveal:game:2020-01-01': JSON.stringify({ date: '2020-01-01', guesses: [], won: false, gameOver: false }),
      'geogames:city-reveal:intro-dismissed:2020-01-01': 'true',
      'geogames:city-reveal:state': history,
    });
    await page.goto('/games/city-reveal');
    await expect(page.getByRole('button', { name: 'Start playing' })).toBeVisible();

    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).sort())).toEqual([
      'geogames:city-reveal:state',
    ]);
    expect(await page.evaluate(() => localStorage.getItem('geogames:city-reveal:state'))).toBe(history);
  });
});
