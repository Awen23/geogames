import { test, expect, type Page } from '@playwright/test';

async function openPlacle(page: Page) {
  await page.goto('/games/geoplace');
  await expect(page.getByTestId('globe')).toBeVisible();
  // The click target only renders once world-50m.json has loaded; clicks before then are lost
  await expect(page.getByTestId('globe-place-target')).toBeVisible();
}

test.describe('Placle (GeoPlace)', () => {
  test('desktop: single click commits placement', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPlacle(page);

    await expect(page.getByText(/click to place it/i)).toBeVisible();
    await expect(page.getByTestId('geoplace-placement-actions')).not.toBeVisible();

    const globe = page.getByTestId('globe');
    const box = await globe.boundingBox();
    if (!box) {
      throw new Error('Globe should have a bounding box');
    }

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.getByText(/placed —/i)).toBeVisible();
  });

  test('mobile: tap places draft, confirm commits placement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlacle(page);

    await expect(page.getByText(/tap where the country should go/i)).toBeVisible();

    const globe = page.getByTestId('globe');
    const box = await globe.boundingBox();
    if (!box) {
      throw new Error('Globe should have a bounding box');
    }

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.getByTestId('geoplace-placement-actions')).toBeVisible();
    await expect(page.getByTestId('draggable-ghost-country')).toBeVisible();

    await page.getByTestId('geoplace-confirm-placement').click();

    await expect(page.getByText(/placed —/i)).toBeVisible();
  });

  test('mobile: cancel clears draft placement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlacle(page);

    const globe = page.getByTestId('globe');
    const box = await globe.boundingBox();
    if (!box) {
      throw new Error('Globe should have a bounding box');
    }

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('geoplace-placement-actions')).toBeVisible();

    await page.getByTestId('geoplace-cancel-placement').click();

    await expect(page.getByTestId('geoplace-placement-actions')).not.toBeVisible();
    await expect(page.getByTestId('draggable-ghost-country')).not.toBeVisible();
    await expect(page.getByText(/tap where the country should go/i)).toBeVisible();
  });
});
