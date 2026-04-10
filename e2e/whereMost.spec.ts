import { test, expect } from '@playwright/test';

test.describe('WhereMost game', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('shows question icon, prompt and country input on load', async ({ page }) => {
    await page.goto('/games/where-most');
    // Question icon (emoji) visible
    await expect(page.getByTestId('question-icon')).toBeVisible({ timeout: 10000 });
    // Country input field
    await expect(page.getByTestId('country-input')).toBeVisible();
    // Globe should NOT be visible during active game
    await expect(page.getByTestId('globe')).not.toBeVisible();
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

  test('selecting a country from suggestions shows a guess result', async ({ page }) => {
    await page.goto('/games/where-most');
    const input = page.getByTestId('country-input');
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill('Ger');
    const dropdown = page.getByRole('listbox', { name: 'Country suggestions' });
    await expect(dropdown).toBeVisible();

    await page.getByRole('option', { name: /Germany/ }).click();

    await expect(page.getByTestId('guess-list')).toBeVisible({ timeout: 5000 });
    // Guess list should contain the country name
    await expect(page.getByTestId('guess-list')).toContainText('Germany');
  });

  test('guessed country is excluded from subsequent suggestions', async ({ page }) => {
    await page.goto('/games/where-most');
    const input = page.getByTestId('country-input');
    await expect(input).toBeVisible({ timeout: 10000 });

    // Select Germany
    await input.fill('Ger');
    await page.getByRole('option', { name: /Germany/ }).click();
    await expect(page.getByTestId('guess-list')).toBeVisible({ timeout: 5000 });

    // Type again — Germany should not appear
    await input.fill('Ger');
    const dropdown = page.getByRole('listbox', { name: 'Country suggestions' });
    // Either dropdown doesn't appear (Germany was the only match) or Germany is absent
    const germanyOption = dropdown.getByRole('option', { name: /Germany/ });
    await expect(germanyOption).not.toBeVisible();
  });

  test('API /today returns expected shape including icon', async ({ request }) => {
    const res = await request.get('/api/games/where-most/today');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: expect.any(String),
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      prompt: expect.any(String),
      metric: expect.any(String),
      unit: expect.any(String),
      source: expect.any(String),
      sourceUrl: expect.any(String),
      icon: expect.any(String),
    });
    // ranking must not be revealed
    expect(body.ranking).toBeUndefined();
  });

  test('API /grade returns GuessResult shape including value', async ({ request }) => {
    const res = await request.post('/api/games/where-most/grade', {
      data: { iso3: 'DEU', guessIndex: 0 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      tier: expect.stringMatching(/^(bullseye|top5|top15|cold)$/),
      isCorrect: expect.any(Boolean),
      distanceKm: expect.any(Number),
      bearingDeg: expect.any(Number),
    });
    // rank and value may be null (if DEU not in today's ranking) or numbers
    expect(body.rank === null || typeof body.rank === 'number').toBe(true);
    expect(body.value === null || typeof body.value === 'number').toBe(true);
  });

  test('API /grade validates input', async ({ request }) => {
    const res = await request.post('/api/games/where-most/grade', {
      data: { iso3: 'XX', guessIndex: 0 }, // invalid — too short
    });
    expect(res.status()).toBe(400);
  });

  test('API /stats/today returns ranking', async ({ request }) => {
    const res = await request.get('/api/games/where-most/stats/today');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      plays: expect.any(Number),
      bullseyeRate: expect.any(Number),
      avgGuesses: expect.any(Number),
      ranking: expect.arrayContaining([
        expect.objectContaining({ iso3: expect.any(String), value: expect.any(Number) }),
      ]),
    });
  });

  test('replay guard: already played today shows end screen with globe heatmap', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await page.addInitScript((date) => {
      const state = { history: [{ date, won: true, guesses: 2 }] };
      localStorage.setItem('geogames:where-most:state', JSON.stringify(state));
    }, today);

    await page.goto('/games/where-most');
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 10000 });
    // Country input should NOT be visible (game already done)
    await expect(page.getByTestId('country-input')).not.toBeVisible();
    // Globe should appear (heatmap) once stats are loaded
    await expect(page.getByTestId('globe')).toBeVisible({ timeout: 8000 });
  });
});
