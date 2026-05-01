import { test, expect } from '@playwright/test';

test.describe('WhereMost game', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('shows question icon, prompt, progress bar and country input on load', async ({ page }) => {
    await page.goto('/games/where-most');
    await expect(page.getByTestId('question-icon')).toBeVisible({ timeout: 10000 });
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

  test('selecting a country shows a guess result and progress bar', async ({ page }) => {
    await page.goto('/games/where-most');
    const input = page.getByTestId('country-input');
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill('Ger');
    await page.getByRole('option', { name: /Germany/ }).click();

    await expect(page.getByTestId('guess-list')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('guess-list')).toContainText('Germany');
    await expect(page.getByRole('progressbar')).toBeVisible();
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
    await expect(page.getByTestId('end-screen')).toContainText('You found 2 of the top 5 countries.');
    await expect(page.getByTestId('guess-list')).toContainText('Germany');
    await expect(page.getByTestId('guess-list')).toContainText('France');
    await expect(page.getByTestId('guess-list')).toContainText('Italy');
    await expect(page.getByTestId('guess-list')).toContainText(/#|Not in today/);
    await expect(page.getByTestId('country-input')).not.toBeVisible();
  });
});
