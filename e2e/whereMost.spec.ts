import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { questions } from '../api/src/data/questions';
import { MOSTLE } from './support/knownPuzzles';

const RESULT_URL = '**/api/games/where-most/result';
const STATE_KEY = 'geogames:where-most:state';

const STATS_URL = '**/api/games/where-most/stats/today';
const PROGRESS_PREFIX = 'geogames:where-most:progress:';

const TODAY = new Date().toISOString().slice(0, 10);

// Each test gets a fresh browser context, so storage starts empty.

// Today's question is beer consumption per person (e2e/support/knownPuzzles.ts).
const ROWS = {
  Germany: '🟩🇩🇪 Germany#5 · 5.28 L pure alcohol/person/yr',
  Poland: '🟩🇵🇱 Poland#4 · 5.52 L pure alcohol/person/yr',
  Spain: '🟨🇪🇸 Spain#12 · 4.25 L pure alcohol/person/yr',
  France: '🟨🇫🇷 France#65 · 2.38 L pure alcohol/person/yr',
  Italy: '🟨🇮🇹 Italy#76 · 1.81 L pure alcohol/person/yr',
};
const TOP_ANSWERS = [
  '#1🇬🇦 Gabon6.37 L pure alcohol/person/yr',
  '#2🇨🇿 Czechia6.30 L pure alcohol/person/yr',
  '#3🇦🇹 Austria5.88 L pure alcohol/person/yr',
  '#4🇵🇱 Poland5.52 L pure alcohol/person/yr',
  '#5🇩🇪 Germany5.28 L pure alcohol/person/yr',
];

/** A full game: 19.233 of the top-5 total of 29.342 is 66%, with 2 of the top 5 found. */
const GAME = ['Germany', 'Poland', 'Spain', 'France', 'Italy'] as const;
const GAME_RESULT = { score: 66, guesses: 5, exactMatches: 2, guessCountries: ['DEU', 'POL', 'ESP', 'FRA', 'ITA'] };
const GAME_SHARE_CARD = '🟩🟩🟨🟨🟨66% score · 2/5 exactCopy result';

/** The end screen's score, e.g. "66%". */
function endScore(page: Page) {
  return page.getByTestId('end-screen').getByRole('heading', { level: 2 });
}

/** Picks a country from the suggestions and waits for the real API to grade it. */
async function pick(page: Page, name: string) {
  await page.getByTestId('country-input').fill(name);
  const graded = page.waitForResponse('**/api/games/where-most/grade');
  await page.getByRole('option', { name: new RegExp(name) }).click();
  await graded;
}

/** Picks ranked countries in turn, waiting for each row to show before the next pick. */
async function guess(page: Page, names: readonly (keyof typeof ROWS)[]) {
  for (const name of names) {
    await pick(page, name);
    await expect(page.getByTestId('guess-list')).toContainText(ROWS[name]);
  }
}

/** Everything the in-progress view shows about the guesses so far. */
async function progressView(page: Page) {
  return {
    rows: await page.getByTestId('guess-list').locator('li').allTextContents(),
    counter: await page.getByTestId('guess-counter').textContent(),
    coverage: await page.getByRole('progressbar').getAttribute('aria-valuenow'),
    progressLabel: await page.getByRole('progressbar').locator('xpath=..').textContent(),
  };
}

function progressKeys(page: Page) {
  return page.evaluate(
    (prefix) => Object.keys(localStorage).filter((k) => k.startsWith(prefix)),
    PROGRESS_PREFIX,
  );
}

/** Records every result submit the page sends (they go to the real API). */
function watchSubmits(page: Page) {
  const submits: unknown[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/games/where-most/result')) {
      submits.push(req.postDataJSON());
    }
  });
  return submits;
}

/**
 * Seeds an in-progress save for today's puzzle (once: addInitScript re-runs on reload), graded as
 * /grade grades them: Germany and France, plus a Vatican City pick that had no data.
 */
async function seedProgress(
  page: Page,
  overrides: { date?: string; questionId?: string; totalGradedRounds?: number } = {},
) {
  const saved = {
    date: TODAY,
    questionId: MOSTLE.questionId,
    guesses: [
      { iso3: 'DEU', result: MOSTLE.grades.DEU },
      { iso3: 'FRA', result: MOSTLE.grades.FRA },
    ],
    noDataIso3s: ['VAT'],
    totalGradedRounds: 3,
    ...overrides,
  };
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [`${PROGRESS_PREFIX}${saved.date}`, JSON.stringify(saved)] as const,
  );
}

async function todayRecord(page: Page) {
  return page.evaluate(
    ([key, date]) => {
      const raw = localStorage.getItem(key);
      const state = raw ? (JSON.parse(raw) as { history: Array<{ date: string }> }) : { history: [] };
      return state.history.find((r) => r.date === date) ?? null;
    },
    [STATE_KEY, TODAY] as const,
  );
}

/**
 * Seeds a finished game for today, so the page opens on the end screen: Germany, France and Italy
 * cover 9.467 of 29.342 (32%), with Germany the one top-5 country.
 */
async function seedPlayedToday(page: Page) {
  const state = {
    history: [{ date: TODAY, won: true, guesses: 3, score: 32, exactMatches: 1, guessCountries: ['DEU', 'FRA', 'ITA'] }],
  };
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [STATE_KEY, JSON.stringify(state)] as const,
  );
}

test.describe('WhereMost game', () => {
  test('shows today\'s question, guess counter and country input on load', async ({ page }) => {
    await page.goto('/games/where-most');
    await expect(page.getByTestId('question-icon')).toHaveText('🍺');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MOSTLE.prompt);
    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 1 of 5');
    await expect(page.getByTestId('country-input')).toBeVisible();
    // End screen should not appear before any guesses
    await expect(page.getByTestId('end-screen')).not.toBeVisible();
  });

  test('typing a country shows autocomplete suggestions', async ({ page }) => {
    await page.goto('/games/where-most');
    const input = page.getByTestId('country-input');

    await input.fill('Ger');
    const dropdown = page.getByRole('listbox', { name: 'Country suggestions' });
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText('Germany');
  });

  test('selecting a country advances the guess counter and shows its graded row and coverage', async ({ page }) => {
    await page.goto('/games/where-most');
    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 1 of 5');

    await pick(page, 'Germany');

    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 2 of 5');
    await expect(page.getByTestId('guess-list').locator('li')).toHaveText([ROWS.Germany]);
    // 5.277 of 29.342
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '18');
  });

  test('no-data guess does not advance the guess counter', async ({ page }) => {
    await page.goto('/games/where-most');

    await pick(page, 'Vatican City');

    await expect(page.getByTestId('no-data-notice')).toHaveText(
      'No data for 🇻🇦 Vatican City in this dataset — try another country (does not use a guess).',
    );
    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 1 of 5');
    await expect(page.getByTestId('guess-list')).not.toBeVisible();
  });

  test('guessed country is excluded from subsequent suggestions', async ({ page }) => {
    await page.goto('/games/where-most');
    await guess(page, ['Germany']);

    await page.getByTestId('country-input').fill('Ger');
    const dropdown = page.getByRole('listbox', { name: 'Country suggestions' });
    const germanyOption = dropdown.getByRole('option', { name: /Germany/ });
    await expect(germanyOption).not.toBeVisible();
  });

  test('API /today returns today\'s question without its ranking', async ({ request }) => {
    const res = await request.get('/api/games/where-most/today');
    expect(res.status()).toBe(200);
    const q = questions.find((question) => question.id === MOSTLE.questionId);
    expect(q).toBeDefined();
    expect(await res.json()).toEqual({
      id: MOSTLE.questionId,
      date: TODAY,
      prompt: MOSTLE.prompt,
      description: q?.description,
      metric: 'Beer consumption per capita',
      unit: MOSTLE.unit,
      year: 2020,
      source: q?.source,
      sourceUrl: 'https://ourworldindata.org/grapher/beer-consumption-per-person?time=2020',
      icon: '🍺',
      mapEmbedUrl: 'https://ourworldindata.org/grapher/beer-consumption-per-person?tab=map&time=2020',
      maxScore: MOSTLE.maxScore,
    });
  });

  test('API /grade grades each tier against today\'s ranking', async ({ request }) => {
    for (const [iso3, grade] of Object.entries(MOSTLE.grades)) {
      const res = await request.post('/api/games/where-most/grade', { data: { iso3 } });
      expect(res.status()).toBe(200);
      // No bearing or distance either
      expect(await res.json(), iso3).toEqual(grade);
    }
  });

  test('API /grade rejects invalid ISO3', async ({ request }) => {
    const res = await request.post('/api/games/where-most/grade', {
      data: { iso3: 'XX' },
    });
    expect(res.status()).toBe(400);
  });

  test('API /stats/today returns today\'s ranking and the play averages', async ({ request }) => {
    const res = await request.get('/api/games/where-most/stats/today');
    expect(res.status()).toBe(200);
    const q = questions.find((question) => question.id === MOSTLE.questionId);
    expect(q).toBeDefined();
    // The plays and averages depend on the games other tests finish in parallel (gameResults.spec
    // checks them exactly).
    expect(await res.json()).toEqual({
      plays: expect.any(Number),
      avgScore: expect.any(Number),
      avgGuesses: expect.any(Number),
      ranking: q?.ranking,
    });
  });

  test('replay guard: already played today shows end screen without country input', async ({ page }) => {
    await seedPlayedToday(page);

    await page.goto('/games/where-most');
    const endScreen = page.getByTestId('end-screen');
    await expect(endScreen).toBeVisible();
    await expect(page.getByTestId('guess-counter')).not.toBeVisible();
    await expect(page.getByTestId('country-input')).not.toBeVisible();
    await expect(endScore(page)).toHaveText('32%');
    await expect(endScreen).toContainText('You found 1 of the top 5 countries.');
    await expect(page.getByTestId('share-card')).toHaveText('🟩🟨🟨⬜⬜32% score · 1/5 exactCopy result');
    // Regraded from the saved countries
    await expect(page.getByTestId('guess-list').locator('li')).toHaveText([ROWS.Germany, ROWS.France, ROWS.Italy]);
    await expect(page.getByRole('region', { name: 'Top 5' }).getByRole('listitem')).toHaveText(TOP_ANSWERS);
  });

  for (const closeAction of ['Close button', 'Escape', 'backdrop click'] as const) {
    test(`expanded map returns focus to the expand button (${closeAction})`, async ({ page }) => {
      await seedPlayedToday(page);

      await page.goto('/games/where-most');
      const expandButton = page.getByRole('button', { name: 'Expand map' });
      await expandButton.click();

      const dialog = page.getByRole('dialog');
      const closeButton = page.getByRole('button', { name: 'Close expanded map' });
      await expect(dialog).toBeVisible();
      await expect(closeButton).toBeFocused();

      if (closeAction === 'Close button') {
        await closeButton.click();
      } else if (closeAction === 'Escape') {
        await page.keyboard.press('Escape');
      } else {
        // The backdrop is the dialog's parent; its centre is covered by the dialog,
        // so click inside its padding.
        await dialog.locator('xpath=..').click({ position: { x: 4, y: 4 } });
      }

      await expect(dialog).not.toBeVisible();
      await expect(expandButton).toBeFocused();
    });
  }
});

test.describe('WhereMost game end persistence', () => {
  test('finished game survives reload when the result submit fails', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));
    let submitAttempts = 0;
    await page.route(RESULT_URL, async (route) => {
      submitAttempts++;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
    });

    await page.goto('/games/where-most');
    await guess(page, GAME);
    await expect(endScore(page)).toHaveText('66%');
    await expect(page.getByTestId('share-card')).toHaveText(GAME_SHARE_CARD);
    await expect.poll(() => submitAttempts).toBe(1);
    await expect.poll(() => todayRecord(page)).toMatchObject({ won: true, ...GAME_RESULT });

    // Wait for the reloaded end screen's stats fetch so a late double-submit can't be missed.
    const statsLoaded = page.waitForResponse(STATS_URL);
    await page.reload();
    await statsLoaded;
    await expect(endScore(page)).toHaveText('66%');
    await expect(page.getByTestId('country-input')).not.toBeVisible();
    await expect(page.getByTestId('guess-list').locator('li')).toHaveText(GAME.map((name) => ROWS[name]));
    expect(await todayRecord(page)).toMatchObject({ won: true, ...GAME_RESULT });
    expect(submitAttempts).toBe(1);
    expect(pageErrors).toEqual([]);
  });

  test('successful game end submits the result exactly once', async ({ page }) => {
    const submits = watchSubmits(page);
    const submitted = page.waitForResponse(RESULT_URL);

    await page.goto('/games/where-most');
    await guess(page, GAME);
    await expect(endScore(page)).toHaveText('66%');
    await expect(page.getByTestId('end-screen')).toContainText('You found 2 of the top 5 countries.');
    await expect(page.getByTestId('share-card')).toHaveText(GAME_SHARE_CARD);

    const response = await submitted;
    expect(response.request().postDataJSON()).toEqual(GAME_RESULT);
    expect(await response.json()).toEqual({ ok: true, recorded: true });
    expect(await todayRecord(page)).toMatchObject({ won: true, ...GAME_RESULT });

    const statsLoaded = page.waitForResponse(STATS_URL);
    await page.reload();
    await statsLoaded;
    await expect(endScore(page)).toHaveText('66%');
    await expect(page.getByRole('region', { name: 'Top 5' }).getByRole('listitem')).toHaveText(TOP_ANSWERS);
    expect(submits).toEqual([GAME_RESULT]);
  });
});

test.describe('WhereMost in-progress persistence', () => {
  test('guesses made so far survive a reload, without regrading or submitting', async ({ page }) => {
    const submits = watchSubmits(page);
    await page.goto('/games/where-most');
    await guess(page, ['Germany']);
    await pick(page, 'Vatican City');
    await expect(page.getByTestId('no-data-notice')).toBeVisible();
    await guess(page, ['Poland']);
    const before = await progressView(page);
    expect(before).toEqual({
      rows: [ROWS.Germany, ROWS.Poland],
      counter: 'Guess 3 of 5',
      // 10.797 of 29.342
      coverage: '36.8',
      progressLabel: 'Coverage: 36.8% of the top-5 total10.8 / 29.3 L pure alcohol/person/yr',
    });

    let gradeCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/games/where-most/grade')) { gradeCalls++; }
    });
    await page.reload();
    await expect(page.getByTestId('guess-list').locator('li')).toHaveCount(2);
    expect(await progressView(page)).toEqual(before);
    await expect(page.getByTestId('end-screen')).not.toBeVisible();

    // Everything already picked (ranked or no-data) stays out of the suggestions.
    const input = page.getByTestId('country-input');
    for (const name of ['Germany', 'Vatican City', 'Poland']) {
      await input.fill(name);
      await expect(page.getByRole('option', { name: new RegExp(name) })).not.toBeVisible();
    }
    expect(gradeCalls).toBe(0);
    expect(submits).toEqual([]);
  });

  test('finishing clears the in-progress save; a reload shows the end screen', async ({ page }) => {
    const submits = watchSubmits(page);
    await page.goto('/games/where-most');
    await guess(page, ['Germany', 'Poland']);
    expect(await progressKeys(page)).toEqual([`${PROGRESS_PREFIX}${TODAY}`]);

    await page.reload();
    await expect(page.getByTestId('guess-list').locator('li')).toHaveText([ROWS.Germany, ROWS.Poland]);
    const submitted = page.waitForResponse(RESULT_URL);
    await guess(page, ['Spain', 'France', 'Italy']);
    expect(await (await submitted).json()).toEqual({ ok: true, recorded: true });
    expect(await progressKeys(page)).toEqual([]);
    const finalRows = GAME.map((name) => ROWS[name]);
    await expect(page.getByTestId('guess-list').locator('li')).toHaveText(finalRows);

    const statsLoaded = page.waitForResponse(STATS_URL);
    await page.reload();
    await statsLoaded;
    await expect(endScore(page)).toHaveText('66%');
    await expect(page.getByTestId('share-card')).toHaveText(GAME_SHARE_CARD);
    await expect(page.getByTestId('country-input')).not.toBeVisible();
    await expect(page.getByTestId('guess-list').locator('li')).toHaveText(finalRows);
    expect(await progressKeys(page)).toEqual([]);
    expect(submits).toEqual([GAME_RESULT]);
  });

  test("a saved game for today's puzzle is restored, including its no-data picks and pick count", async ({ page }) => {
    const submits = watchSubmits(page);
    // 19 = MAX_TOTAL_SELECTIONS - 1 (a literal: e2e doesn't import page constants), so one more pick ends the game.
    await seedProgress(page, { totalGradedRounds: 19 });
    await page.goto('/games/where-most');
    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 3 of 5');
    await expect(page.getByTestId('guess-list').locator('li')).toHaveText([ROWS.Germany, ROWS.France]);

    // Once suggestions have rendered, the saved no-data pick must not be among them.
    await page.getByTestId('country-input').fill('Va');
    await expect(page.getByRole('option', { name: /Vanuatu/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Vatican/ })).not.toBeVisible();

    // The restored pick count still caps the game: the 20th pick ends it, whatever its grade.
    // Germany, France and Spain cover 11.903 of 29.342: 41%.
    const submitted = page.waitForResponse(RESULT_URL);
    await guess(page, ['Spain']);
    await expect(endScore(page)).toHaveText('41%');
    await expect(page.getByTestId('share-card')).toHaveText('🟩🟨🟨⬜⬜41% score · 1/5 exactCopy result');
    const result = { score: 41, guesses: 3, exactMatches: 1, guessCountries: ['DEU', 'FRA', 'ESP'] };
    expect(await (await submitted).json()).toEqual({ ok: true, recorded: true });
    expect(submits).toEqual([result]);
    expect(await progressKeys(page)).toEqual([]);
  });

  for (const c of [
    { name: 'another date is ignored and pruned', date: '2020-01-01' },
    { name: 'another question is ignored', questionId: 'not-todays-question' },
  ]) {
    test(`a saved game for ${c.name}`, async ({ page }) => {
      await seedProgress(page, c);
      await page.goto('/games/where-most');
      await expect(page.getByTestId('guess-counter')).toHaveText('Guess 1 of 5');
      await expect(page.getByTestId('guess-list')).not.toBeVisible();
      await expect(page.getByRole('progressbar')).not.toBeVisible();
      if (c.date) {
        await expect.poll(() => progressKeys(page)).toEqual([]);
      }
    });
  }
});
