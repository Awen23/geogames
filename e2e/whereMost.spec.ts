import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

const RESULT_URL = '**/api/games/where-most/result';
const STATE_KEY = 'geogames:where-most:state';

const STATS_URL = '**/api/games/where-most/stats/today';
const PROGRESS_PREFIX = 'geogames:where-most:progress:';

// Assumes at least 5 of these have data for whatever today's question is. If not, the
// list runs out before the game ends and the final end-screen expect fails loudly.
const CANDIDATES = [
  'Germany', 'France', 'Italy', 'Spain', 'Poland', 'Japan', 'Brazil', 'Canada',
  'Mexico', 'Egypt', 'Kenya', 'Peru', 'Chile', 'Norway', 'Sweden',
];

/** Picks one country, graded by the real API, and waits until it has landed (ranked, no-data notice, or game over). */
async function guessCountry(page: Page, name: string) {
  const input = page.getByTestId('country-input');
  const endScreen = page.getByTestId('end-screen');
  await input.fill(name);
  const graded = page.waitForResponse('**/api/games/where-most/grade');
  await page.getByRole('option', { name: new RegExp(name) }).click();
  await graded;
  await expect(async () => {
    const shown = [
      ...(await page.getByTestId('guess-list').allTextContents()),
      ...(await page.getByTestId('no-data-notice').allTextContents()),
    ].join(' ');
    expect((await endScreen.isVisible()) || shown.includes(name)).toBe(true);
  }).toPass({ timeout: 5000 });
}

/**
 * Plays today's real puzzle to the end, with guesses graded by the real API.
 * No-data countries don't use a slot, so keep picking from the list until the end screen appears.
 * `skip` leaves out countries already picked (they are no longer offered).
 */
async function playToEnd(page: Page, skip: string[] = []) {
  const endScreen = page.getByTestId('end-screen');
  await expect(page.getByTestId('country-input')).toBeVisible({ timeout: 10000 });

  for (const name of CANDIDATES.filter((n) => !skip.includes(n))) {
    if (await endScreen.isVisible()) {
      break;
    }
    await guessCountry(page, name);
  }
  await expect(endScreen).toBeVisible();
}

/** Picks countries until `count` of them are ranked guesses; returns every country picked (including no-data ones). */
async function playGuesses(page: Page, count: number) {
  const rows = page.getByTestId('guess-list').locator('li');
  await expect(page.getByTestId('country-input')).toBeVisible({ timeout: 10000 });
  const picked: string[] = [];
  for (const name of CANDIDATES) {
    if (await rows.count() >= count) {
      break;
    }
    await guessCountry(page, name);
    picked.push(name);
  }
  await expect(rows).toHaveCount(count);
  return picked;
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

/**
 * Seeds an in-progress save (once: addInitScript re-runs on reload). Defaults to today's puzzle
 * as the server reports it; the cold France guess is unranked, exactly as /grade returns one.
 */
async function seedProgress(
  page: Page,
  request: APIRequestContext,
  overrides: { date?: string; questionId?: string; totalGradedRounds?: number } = {},
) {
  const today = (await (await request.get('/api/games/where-most/today')).json()) as { id: string; date: string };
  const saved = {
    date: today.date,
    questionId: today.id,
    guesses: [
      { iso3: 'DEU', result: { tier: 'found', rank: 1, value: 100, isTopFive: true } },
      { iso3: 'FRA', result: { tier: 'cold', rank: null, value: null, isTopFive: false } },
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

/** Stubs the result submit with a 200 so these tests never write to the shared dev DB; returns the call count. */
async function stubSubmit(page: Page) {
  const calls = { count: 0 };
  await page.route(RESULT_URL, async (route) => {
    calls.count++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  return calls;
}

async function todayRecord(page: Page) {
  const today = new Date().toISOString().slice(0, 10);
  return page.evaluate(
    ([key, date]) => {
      const raw = localStorage.getItem(key);
      const state = raw ? (JSON.parse(raw) as { history: Array<{ date: string }> }) : { history: [] };
      return state.history.find((r) => r.date === date) ?? null;
    },
    [STATE_KEY, today] as const,
  );
}

test.describe('WhereMost game', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('shows question icon, prompt, guess counter and country input on load', async ({ page }) => {
    await page.goto('/games/where-most');
    await expect(page.getByTestId('question-icon')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 1 of 5');
    await expect(page.getByTestId('country-input')).toBeVisible();
    // End screen should not appear before any guesses
    await expect(page.getByTestId('end-screen')).not.toBeVisible();
  });

  test('typing a country shows autocomplete suggestions', async ({ page }) => {
    await page.goto('/games/where-most');
    const input = page.getByTestId('country-input');
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill('Ger');
    const dropdown = page.getByRole('listbox', { name: 'Country suggestions' });
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText('Germany');
  });

  test('selecting a country advances the guess counter and shows a guess result', async ({ page }) => {
    await page.goto('/games/where-most');
    const input = page.getByTestId('country-input');
    await expect(input).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 1 of 5');

    await input.fill('Ger');
    await page.getByRole('option', { name: /Germany/ }).click();

    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 2 of 5', { timeout: 5000 });
    await expect(page.getByTestId('guess-list')).toBeVisible();
    await expect(page.getByTestId('guess-list')).toContainText('Germany');
    await expect(page.getByRole('progressbar')).toBeVisible();
  });

  test('no-data guess does not advance the guess counter', async ({ page }) => {
    await page.route('**/api/games/where-most/grade', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tier: 'no-data',
          isTopFive: false,
          rank: null,
          value: null,
        }),
      });
    });

    await page.goto('/games/where-most');
    const input = page.getByTestId('country-input');
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill('Ger');
    await page.getByRole('option', { name: /Germany/ }).click();

    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 1 of 5', { timeout: 5000 });
    await expect(page.getByTestId('no-data-notice')).toBeVisible();
    await expect(page.getByTestId('guess-list')).not.toBeVisible();
  });

  test('guessed country is excluded from subsequent suggestions', async ({ page }) => {
    await page.goto('/games/where-most');
    const input = page.getByTestId('country-input');
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill('Ger');
    await page.getByRole('option', { name: /Germany/ }).click();
    await expect(page.getByTestId('guess-list')).toBeVisible({ timeout: 5000 });

    await input.fill('Ger');
    const dropdown = page.getByRole('listbox', { name: 'Country suggestions' });
    const germanyOption = dropdown.getByRole('option', { name: /Germany/ });
    await expect(germanyOption).not.toBeVisible();
  });

  test('API /today returns expected shape including icon, maxScore, mapEmbedUrl', async ({ request }) => {
    const res = await request.get('/api/games/where-most/today');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: expect.any(String),
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      prompt: expect.any(String),
      metric: expect.any(String),
      unit: expect.any(String),
      year: expect.any(Number),
      source: expect.any(String),
      sourceUrl: expect.any(String),
      icon: expect.any(String),
      description: expect.any(String),
      maxScore: expect.any(Number),
      mapEmbedUrl: expect.stringContaining('ourworldindata.org'),
    });
    expect(body.ranking).toBeUndefined();
  });

  test('API /grade returns simplified GuessResult (no bearing/distance)', async ({ request }) => {
    const res = await request.post('/api/games/where-most/grade', {
      data: { iso3: 'DEU' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      tier: expect.stringMatching(/^(found|warm|cold|no-data)$/),
      isTopFive: expect.any(Boolean),
    });
    expect(body.rank === null || typeof body.rank === 'number').toBe(true);
    expect(body.value === null || typeof body.value === 'number').toBe(true);
    // Bearing and distance are no longer returned
    expect(body.distanceKm).toBeUndefined();
    expect(body.bearingDeg).toBeUndefined();
  });

  test('API /grade rejects invalid ISO3', async ({ request }) => {
    const res = await request.post('/api/games/where-most/grade', {
      data: { iso3: 'XX' },
    });
    expect(res.status()).toBe(400);
  });

  test('API /stats/today returns ranking and avgScore', async ({ request }) => {
    const res = await request.get('/api/games/where-most/stats/today');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      plays: expect.any(Number),
      avgScore: expect.any(Number),
      avgGuesses: expect.any(Number),
      ranking: expect.arrayContaining([
        expect.objectContaining({ iso3: expect.any(String), value: expect.any(Number) }),
      ]),
    });
    expect((body as Record<string, unknown>).perfectRate).toBeUndefined();
  });

  test('replay guard: already played today shows end screen without country input', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await page.addInitScript((date) => {
      const state = { history: [{ date, won: true, guesses: 3, score: 72, exactMatches: 2, guessCountries: ['DEU', 'FRA', 'ITA'] }] };
      localStorage.setItem('geogames:where-most:state', JSON.stringify(state));
    }, today);

    await page.goto('/games/where-most');
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('guess-counter')).not.toBeVisible();
    await expect(page.getByTestId('end-screen')).toContainText('You found 2 of the top 5 countries.');
    await expect(page.getByTestId('guess-list')).toContainText('Germany');
    await expect(page.getByTestId('guess-list')).toContainText('France');
    await expect(page.getByTestId('guess-list')).toContainText('Italy');
    await expect(page.getByTestId('guess-list')).toContainText(/#|Not in today/);
    await expect(page.getByTestId('country-input')).not.toBeVisible();
  });
});

// No localStorage.clear() init script here: it would also run on reload and wipe the
// record under test. Each test gets a fresh browser context, so storage starts empty.
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
    await playToEnd(page);
    await expect.poll(() => submitAttempts).toBe(1);
    await expect.poll(() => todayRecord(page)).not.toBeNull();

    // Wait for the reloaded end screen's stats fetch so a late double-submit can't be missed.
    const statsLoaded = page.waitForResponse(STATS_URL);
    await page.reload();
    await statsLoaded;
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('country-input')).not.toBeVisible();
    await expect(page.getByTestId('guess-list')).toBeVisible();
    expect(await todayRecord(page)).not.toBeNull();
    expect(submitAttempts).toBe(1);
    expect(pageErrors).toEqual([]);
  });

  // The submit is stubbed so this test never writes to the shared dev DB (gameResults.spec
  // asserts exact play counts there). Server-side validation is covered in gameResults.spec.
  test('successful game end submits the result exactly once', async ({ page }) => {
    const payloads: Array<{ score: number; guesses: number; exactMatches: number; guessCountries: string[] }> = [];
    await page.route(RESULT_URL, async (route) => {
      payloads.push(route.request().postDataJSON() as (typeof payloads)[number]);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto('/games/where-most');
    await playToEnd(page);
    await expect.poll(() => payloads.length).toBe(1);
    await expect.poll(() => todayRecord(page)).not.toBeNull();

    const [payload] = payloads;
    const rankedRows = await page.getByTestId('guess-list').locator('li').count();
    expect(payload.guesses).toBe(rankedRows);
    expect(payload.guessCountries).toHaveLength(payload.guesses);
    expect(payload.exactMatches).toBeLessThanOrEqual(payload.guesses);
    const record = (await todayRecord(page)) as { guesses: number; score: number; exactMatches: number } | null;
    expect(record).toMatchObject({
      guesses: payload.guesses,
      score: payload.score,
      exactMatches: payload.exactMatches,
    });

    const statsLoaded = page.waitForResponse(STATS_URL);
    await page.reload();
    await statsLoaded;
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 10000 });
    expect(await todayRecord(page)).not.toBeNull();
    expect(payloads).toHaveLength(1);
  });
});

// Same as above: no clear-on-load init script, or the reloads under test would start empty.
test.describe('WhereMost in-progress persistence', () => {
  test('guesses made so far survive a reload, without regrading or submitting', async ({ page }) => {
    const submits = await stubSubmit(page);
    await page.goto('/games/where-most');
    const picked = await playGuesses(page, 2);
    const before = await progressView(page);
    expect(before.counter).toBe('Guess 3 of 5');

    let gradeCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/games/where-most/grade')) { gradeCalls++; }
    });
    await page.reload();
    await expect(page.getByTestId('guess-list').locator('li')).toHaveCount(2, { timeout: 10000 });
    expect(await progressView(page)).toEqual(before);
    await expect(page.getByTestId('end-screen')).not.toBeVisible();

    // Everything already picked (ranked or no-data) stays out of the suggestions.
    const input = page.getByTestId('country-input');
    for (const name of picked) {
      await input.fill(name);
      await expect(page.getByRole('option', { name: new RegExp(name) })).not.toBeVisible();
    }
    expect(gradeCalls).toBe(0);
    expect(submits.count).toBe(0);
  });

  test('finishing clears the in-progress save; a reload shows the end screen', async ({ page }) => {
    const submits = await stubSubmit(page);
    await page.goto('/games/where-most');
    const picked = await playGuesses(page, 2);
    const firstRows = await page.getByTestId('guess-list').locator('li').allTextContents();
    expect(await progressKeys(page)).toHaveLength(1);

    await page.reload();
    await expect(page.getByTestId('guess-list').locator('li')).toHaveCount(2, { timeout: 10000 });
    await playToEnd(page, picked);
    await expect.poll(() => submits.count).toBe(1);
    expect(await progressKeys(page)).toEqual([]);
    const finalRows = await page.getByTestId('guess-list').locator('li').allTextContents();
    expect(finalRows.slice(0, 2)).toEqual(firstRows);

    const statsLoaded = page.waitForResponse(STATS_URL);
    await page.reload();
    await statsLoaded;
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('country-input')).not.toBeVisible();
    expect(await page.getByTestId('guess-list').locator('li').allTextContents()).toEqual(finalRows);
    expect(await progressKeys(page)).toEqual([]);
    expect(submits.count).toBe(1);
  });

  test("a saved game for today's puzzle is restored, including its no-data picks and pick count", async ({ page, request }) => {
    const submits = await stubSubmit(page);
    // 19 = MAX_TOTAL_SELECTIONS - 1 (a literal: e2e doesn't import page constants), so one more pick ends the game.
    await seedProgress(page, request, { totalGradedRounds: 19 });
    await page.goto('/games/where-most');
    await expect(page.getByTestId('country-input')).toBeVisible({ timeout: 10000 });
    // The unranked cold France guess still uses a slot but has no row.
    await expect(page.getByTestId('guess-counter')).toHaveText('Guess 3 of 5');
    await expect(page.getByTestId('guess-list').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('guess-list')).toContainText('Germany');

    // Once suggestions have rendered, the saved no-data pick must not be among them.
    await page.getByTestId('country-input').fill('Va');
    await expect(page.getByRole('option', { name: /Vanuatu/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Vatican/ })).not.toBeVisible();

    // The restored pick count still caps the game: the 20th pick ends it, whatever its grade.
    await guessCountry(page, 'Spain');
    await expect(page.getByTestId('end-screen')).toBeVisible();
    await expect.poll(() => submits.count).toBe(1);
    expect(await progressKeys(page)).toEqual([]);
  });

  for (const c of [
    { name: 'another date is ignored and pruned', date: '2020-01-01' },
    { name: 'another question is ignored', questionId: 'not-todays-question' },
  ]) {
    test(`a saved game for ${c.name}`, async ({ page, request }) => {
      const submits = await stubSubmit(page);
      await seedProgress(page, request, c);
      await page.goto('/games/where-most');
      await expect(page.getByTestId('country-input')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('guess-counter')).toHaveText('Guess 1 of 5');
      await expect(page.getByTestId('guess-list')).not.toBeVisible();
      await expect(page.getByRole('progressbar')).not.toBeVisible();
      if (c.date) {
        await expect.poll(() => progressKeys(page)).toEqual([]);
      }
      expect(submits.count).toBe(0);
    });
  }
});
