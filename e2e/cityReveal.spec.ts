import { test, expect, type Page } from '@playwright/test';

const TODAY = '2026-05-18';

interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function stubCityRevealToday(page: Page) {
  await page.route('**/api/games/city-reveal/today', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        date: TODAY,
        cityId: 'bern',
        lat: 46.948,
        lon: 7.4474,
        zoom: 13,
      }),
    });
  });
}

async function openMaple(page: Page) {
  await stubCityRevealToday(page);
  await page.goto('/games/city-reveal');
}

async function dismissIntro(page: Page) {
  await page.getByRole('button', { name: 'Start playing' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play Maple' })).not.toBeVisible();
}

function requireBox(box: ElementBox | null, name: string) {
  if (box === null) {
    throw new Error(`${name} should have a bounding box`);
  }

  return box;
}

test.describe('Maple game', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('dismisses the intro modal once per puzzle date', async ({ page }) => {
    await openMaple(page);

    await expect(page.getByRole('dialog', { name: 'How to play Maple' })).toBeVisible();
    await dismissIntro(page);

    await page.reload();
    await expect(page.getByRole('dialog', { name: 'How to play Maple' })).not.toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Enter a city name' })).toBeVisible();
  });

  test('uses the reduced-motion intro fallback instead of the animated demo', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMaple(page);

    await expect(page.getByText(/Demo summary:/)).toBeVisible();
    await expect(
      page.getByAltText('Animated demo showing a Maple city guess revealing more map detail and distance clues.'),
    ).not.toBeAttached();
  });

  test('opens city suggestions above the mobile bottom panel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMaple(page);
    await dismissIntro(page);

    const input = page.getByRole('combobox', { name: 'Enter a city name' });
    await input.fill('Ber');

    const dropdown = page.getByRole('listbox', { name: 'City suggestions' });
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByRole('option', { name: /Bern/ })).toBeVisible();

    const inputBox = requireBox(await input.boundingBox(), 'City input');
    const dropdownBox = requireBox(await dropdown.boundingBox(), 'City suggestions');
    expect(dropdownBox.y + dropdownBox.height).toBeLessThanOrEqual(inputBox.y + 1);
  });
});
