import { test, expect, type Page } from '@playwright/test';
import { LAYER_GROUP_IDS, classifyLayer, type LayerGroupId } from '../web/src/components/CityRevealMap/layers';

/** Debug handles that CityReveal.tsx exposes on `window` in dev mode */
declare global {
  interface Window {
    __mapleMap?: { getPadding: () => { top: number; bottom: number; left: number; right: number } };
  }
}

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

async function waitForMapReady(page: Page) {
  // The real MapTiler style and tiles load here, which can be slow under parallel workers
  await expect(page.getByTestId('city-reveal-map')).toHaveCSS('opacity', '1', { timeout: 20_000 });
}

async function stubWrongGuess(page: Page) {
  await page.route('**/api/games/city-reveal/guess', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ correct: false, distanceKm: 435, bearing: 120 }),
    });
  });
}

async function makeGuess(page: Page, city: string) {
  await page.getByRole('combobox', { name: 'Enter a city name' }).fill(city);
  await page.getByRole('listbox', { name: 'City suggestions' }).getByRole('option', { name: new RegExp(city) }).click();
  await expect(page.getByText('435 km')).toBeVisible();
}

async function mapPaddingAndPanelHeight(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-testid="city-reveal-panel"]');
    return {
      padding: window.__mapleMap?.getPadding() ?? null,
      panelHeight: panel?.offsetHeight ?? null,
    };
  });
}

async function expectMapPaddedByPanel(page: Page) {
  await expect.poll(async () => {
    const { padding, panelHeight } = await mapPaddingAndPanelHeight(page);
    const paddingBottom = padding === null ? null : Math.round(padding.bottom);
    const matches = paddingBottom !== null && panelHeight !== null && panelHeight > 0
      && paddingBottom === panelHeight;
    return matches ? 'padding matches panel' : `padding bottom ${paddingBottom}, panel height ${panelHeight}`;
  }, { message: 'map bottom padding should match the mobile panel height' }).toBe('padding matches panel');
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

  test('the live map style has layers for every reveal group', async ({ page }) => {
    // Take the style from the game's own request, so this checks the URL and key it really uses
    const styleResponse = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith('/style.json'));
    await openMaple(page);
    const response = await styleResponse;
    expect(response.ok()).toBeTruthy();
    const style = await response.json() as {
      layers: { id: string; type: string; 'source-layer'?: string; minzoom?: number }[];
    };

    const counts = new Map<LayerGroupId, number>();
    for (const layer of style.layers) {
      const group = classifyLayer(layer.id, layer.type, layer['source-layer'], layer.minzoom);
      if (group === null) { continue; }
      expect(LAYER_GROUP_IDS, `group of layer "${layer.id}"`).toContain(group);
      // setupMapLayers hides 3D extrusions, so they don't count towards the buildings group
      if (layer.type === 'fill-extrusion') { continue; }
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }

    // streets-v4 has no contour layers
    const emptyGroups = LAYER_GROUP_IDS.filter((id) => id !== 'contours' && !counts.get(id));
    expect(emptyGroups).toEqual([]);
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

  test('pads the mobile map by the bottom panel height, and follows it as it grows', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 375, height: 812 });
    await stubWrongGuess(page);
    await openMaple(page);
    await dismissIntro(page);

    await waitForMapReady(page);
    await expectMapPaddedByPanel(page);
    const before = await mapPaddingAndPanelHeight(page);

    await makeGuess(page, 'Paris');

    await expectMapPaddedByPanel(page);
    const after = await mapPaddingAndPanelHeight(page);
    expect(after.panelHeight).toBeGreaterThan(before.panelHeight ?? 0);
  });

  test('does not pad the desktop map, where the panel sits beside it', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await stubWrongGuess(page);
    await openMaple(page);
    await dismissIntro(page);

    await waitForMapReady(page);
    await expect.poll(async () => (await mapPaddingAndPanelHeight(page)).padding)
      .toEqual({ top: 0, bottom: 0, left: 0, right: 0 });

    // The desktop panel is full height, so resize the viewport as well to make the panel observer fire
    await makeGuess(page, 'Paris');
    await page.setViewportSize({ width: 1280, height: 700 });
    await expect.poll(async () => (await mapPaddingAndPanelHeight(page)).panelHeight).toBe(700);
    await expect.poll(async () => (await mapPaddingAndPanelHeight(page)).padding)
      .toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});
