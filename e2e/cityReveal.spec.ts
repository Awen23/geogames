import { test, expect, type Page } from '@playwright/test';
import { LAYER_GROUP_IDS, classifyLayer, type LayerGroupId } from '../web/src/components/CityRevealMap/layers';

interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TODAY = new Date().toISOString().slice(0, 10);

// Today's city is Bern (e2e/support/knownPuzzles.ts). Each test gets a fresh browser context, so
// storage starts empty.
async function openMaple(page: Page) {
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

/** Guesses a city through the real API, waits for its row, and returns the /guess response. */
async function guessCity(page: Page, name: string) {
  const rows = page.getByLabel(/^Direction: bearing/);
  const rowsBefore = await rows.count();
  await page.getByRole('combobox', { name: 'Enter a city name' }).fill(name);
  const response = page.waitForResponse('**/api/games/city-reveal/guess');
  await page.getByRole('listbox', { name: 'City suggestions' }).getByRole('option', { name: new RegExp(name) }).click();
  const body: unknown = await (await response).json();
  await expect(rows).toHaveCount(rowsBefore + 1);
  return body;
}

/** Guesses Paris: Bern is 435 km away, on a bearing of 119°. */
async function guessParis(page: Page) {
  expect(await guessCity(page, 'Paris')).toEqual({ correct: false, distanceKm: 435, bearing: 119 });
  await expect(page.getByText('435 km')).toBeVisible();
  await expect(page.getByLabel('Direction: bearing 119')).toBeVisible();
}

function requireBox(box: ElementBox | null, name: string) {
  if (box === null) {
    throw new Error(`${name} should have a bounding box`);
  }

  return box;
}

/**
 * Checks where the map centres Bern, read from the page rather than from the map object. The third
 * wrong guess shows Bern's three landmark markers, whose centroid is within about 10 px of the city
 * centre at these zooms. Mobile pads the map by the bottom panel, so the centre sits in the band
 * above it; unpadded, it would be panelHeight / 2 (well over 100 px) lower.
 */
async function expectBernCentredAbovePanel(page: Page, padded: boolean) {
  const markers = page.locator('.maplibregl-marker');
  await expect(markers).toHaveCount(3);
  await expect(async () => {
    const map = requireBox(await page.getByTestId('city-reveal-map').boundingBox(), 'Map');
    const panel = requireBox(await page.getByTestId('city-reveal-panel').boundingBox(), 'Panel');
    const centres = await markers.evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }));
    const centroid = {
      x: centres.reduce((sum, c) => sum + c.x, 0) / centres.length,
      y: centres.reduce((sum, c) => sum + c.y, 0) / centres.length,
    };
    const expected = {
      x: map.x + map.width / 2,
      y: map.y + (map.height - (padded ? panel.height : 0)) / 2,
    };
    expect(Math.abs(centroid.x - expected.x), 'horizontal offset from the expected centre').toBeLessThanOrEqual(20);
    expect(Math.abs(centroid.y - expected.y), 'vertical offset from the expected centre').toBeLessThanOrEqual(20);
  }).toPass({ timeout: 10_000 });
}

test.describe('Maple game', () => {
  test('API /today returns today\'s city', async ({ request }) => {
    const res = await request.get('/api/games/city-reveal/today');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ date: TODAY, cityId: 'bern', lat: 46.948, lon: 7.4474, zoom: 13 });
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

    const emptyGroups = LAYER_GROUP_IDS.filter((id) => !counts.get(id));
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

  test('losing shows today\'s city and records the loss', async ({ page }) => {
    // Five guesses on the WebGL map: under parallel workers this takes about 30 s.
    test.slow();
    await openMaple(page);
    await dismissIntro(page);

    const submitted = page.waitForResponse('**/api/games/city-reveal/result');
    for (const city of ['Paris', 'Rome', 'Vienna', 'Madrid', 'London']) {
      await guessCity(page, city);
    }
    const response = await submitted;
    expect(response.request().postDataJSON()).toEqual({ won: false, guesses: 5 });
    expect(await response.json()).toEqual({ ok: true, recorded: true });

    await expect(page.getByText('❌ Better luck tomorrow')).toBeVisible();
    await expect(page.getByText('Bern', { exact: true })).toBeVisible();
    await expect(page.getByText('Switzerland', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Enter a city name' })).not.toBeVisible();
  });

  test('pads the mobile map by the bottom panel height, and follows it as it grows', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 375, height: 812 });
    await openMaple(page);
    await dismissIntro(page);
    await waitForMapReady(page);

    await guessParis(page);
    await guessCity(page, 'Rome');
    await guessCity(page, 'Vienna');
    await expectBernCentredAbovePanel(page, true);
    const panelBefore = requireBox(await page.getByTestId('city-reveal-panel').boundingBox(), 'Panel');

    // The panel keeps its height through the fourth guess; the fifth loses the game, and the panel
    // grows to show the answer. (Landmarks only show from the third guess, so the earlier growth,
    // at the first guess, can't be checked this way.)
    await guessCity(page, 'Madrid');
    await guessCity(page, 'London');
    await expect.poll(async () => (await page.getByTestId('city-reveal-panel').boundingBox())?.height)
      .toBeGreaterThan(panelBefore.height);
    await expectBernCentredAbovePanel(page, true);
  });

  test('does not pad the desktop map, where the panel sits beside it', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMaple(page);
    await dismissIntro(page);
    await waitForMapReady(page);

    await guessParis(page);
    await guessCity(page, 'Rome');
    await guessCity(page, 'Vienna');
    await expectBernCentredAbovePanel(page, false);

    // The desktop panel is full height, so resize the viewport as well to make the panel observer fire
    await guessCity(page, 'Madrid');
    await page.setViewportSize({ width: 1280, height: 700 });
    await expect.poll(async () => (await page.getByTestId('city-reveal-panel').boundingBox())?.height).toBe(700);
    await expectBernCentredAbovePanel(page, false);
  });
});
