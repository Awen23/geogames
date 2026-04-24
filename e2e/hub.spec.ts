import { test, expect } from '@playwright/test';

test.describe('Hub page', () => {
  test('hub loads and shows the Mostle game card', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Geogames');
    await expect(page.getByText('Mostle')).toBeVisible();
  });

  test('game card links to /games/where-most', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Mostle').click();
    await expect(page).toHaveURL('/games/where-most');
  });

  test('hub shows played badge when game was won today', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await page.addInitScript((date) => {
      const state = { history: [{ date, won: true, guesses: 2, score: 64 }] };
      localStorage.setItem('geogames:where-most:state', JSON.stringify(state));
    }, today);

    await page.goto('/');
    await expect(page.getByText('Mostle')).toBeVisible();
    await expect(page.getByText(/Score: 64%/)).toBeVisible();
  });

  test('hub shows played state when game was lost today', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await page.addInitScript((date) => {
      const state = { history: [{ date, won: false, guesses: 5 }] };
      localStorage.setItem('geogames:where-most:state', JSON.stringify(state));
    }, today);

    await page.goto('/');
    await expect(page.getByText('Mostle')).toBeVisible();
    await expect(page.getByText(/come back tomorrow/)).toBeVisible();
  });
});
