import { test, expect } from '@playwright/test';

test.describe('WhereMost game', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test to reset game state
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('globe renders on game page', async ({ page }) => {
    await page.goto('/games/where-most');
    await expect(page.getByTestId('globe')).toBeVisible({ timeout: 10000 });
    // SVG should be present inside the globe
    await expect(page.locator('[data-testid="globe"] svg')).toBeVisible();
  });

  test('clicking a country shows a guess result', async ({ page }) => {
    await page.goto('/games/where-most');
    const globe = page.getByTestId('globe');
    await expect(globe).toBeVisible({ timeout: 10000 });

    // Click somewhere on the globe (centre of the SVG)
    const svgEl = globe.locator('svg').first();
    const box = await svgEl.boundingBox();
    if (!box) { throw new Error('Could not find globe SVG bounding box'); }

    // Try clicking a few positions until we hit a country (not ocean)
    const clickPositions = [
      { x: box.x + box.width * 0.45, y: box.y + box.height * 0.4 },
      { x: box.x + box.width * 0.5, y: box.y + box.height * 0.45 },
      { x: box.x + box.width * 0.55, y: box.y + box.height * 0.5 },
    ];

    for (const pos of clickPositions) {
      await page.mouse.click(pos.x, pos.y);
      const guessListVisible = await page.getByTestId('guess-list').isVisible();
      if (guessListVisible) { break; }
    }

    // After clicking a country, the guess list should appear
    await expect(page.getByTestId('guess-list')).toBeVisible({ timeout: 5000 });
  });

  test('API /today returns expected shape', async ({ request }) => {
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
    });
    // ranking must not be revealed
    expect(body.ranking).toBeUndefined();
  });

  test('API /grade returns GuessResult shape', async ({ request }) => {
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
  });

  test('API /grade validates input', async ({ request }) => {
    const res = await request.post('/api/games/where-most/grade', {
      data: { iso3: 'XX', guessIndex: 0 }, // invalid ISO3 (too short)
    });
    expect(res.status()).toBe(400);
  });

  test('replay guard: already played today shows end screen', async ({ page }) => {
    // Simulate having played today by writing to localStorage
    const today = new Date().toISOString().slice(0, 10);
    await page.addInitScript((date) => {
      const state = { history: [{ date, won: true, guesses: 2 }] };
      localStorage.setItem('geogames:where-most:state', JSON.stringify(state));
    }, today);

    await page.goto('/games/where-most');
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 10000 });
    // Globe should NOT be visible (game already done)
    await expect(page.getByTestId('globe')).not.toBeVisible();
  });
});
