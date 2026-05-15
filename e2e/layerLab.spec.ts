import { test, expect, type Page } from '@playwright/test';
import { LAYER_GROUPS } from '../web/src/components/CityRevealMap/layers';

const STAGE_LABELS = ['Terrain', 'Water', 'Roads & Railways', 'Landmarks', 'Road Names'];

/** Wait for the MapLibre map to finish its initial load and layer classification */
async function waitForMapReady(page: Page) {
  await page.waitForFunction(
    () => typeof (window as Record<string, unknown>)['__layerLabGroups'] !== 'undefined',
    { timeout: 15_000 },
  );
}

/** Return the layer group map exposed in dev mode */
async function getLayerGroups(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(
    () => (window as Record<string, unknown>)['__layerLabGroups'] as Record<string, string[]>,
  );
}

test.describe('Layer Lab', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/layer-lab');
    await waitForMapReady(page);
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test('page loads with map and sidebar', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Maple Lab' })).toBeVisible();
    await expect(page.locator('[data-testid="layer-lab-map"]')).toBeVisible();
  });

  test('all expected city options are present', async ({ page }) => {
    const citySelect = page.getByRole('combobox');
    for (const city of ['Bern', 'Osaka', 'Tegucigalpa', 'Kinshasa', 'Bishkek', 'La Paz', 'Perth']) {
      await expect(citySelect).toContainText(city);
    }
  });

  test('all layer toggle buttons are present', async ({ page }) => {
    for (const label of STAGE_LABELS) {
      await expect(
        page.getByRole('switch', { name: `Toggle ${label}` }),
      ).toBeVisible();
    }
  });

  // ── Layer classification ──────────────────────────────────────────────────

  test('terrain layers are classified (>0 layers)', async ({ page }) => {
    const groups = await getLayerGroups(page);
    expect(groups['terrain']?.length).toBeGreaterThan(0);
  });

  test('road name layers are classified (road_label / transportation_name)', async ({ page }) => {
    const groups = await getLayerGroups(page);
    expect(groups['roadNames']?.length).toBeGreaterThan(0);
  });

  test('major road layers are classified', async ({ page }) => {
    const groups = await getLayerGroups(page);
    expect(groups['majorRoads']?.length).toBeGreaterThan(0);
  });

  test('street grid layers are classified', async ({ page }) => {
    const groups = await getLayerGroups(page);
    expect(groups['streetGrid']?.length).toBeGreaterThan(0);
  });

  test('water layers are classified', async ({ page }) => {
    const groups = await getLayerGroups(page);
    expect(groups['water']?.length).toBeGreaterThan(0);
  });

  test('no layer classified into a non-existent group', async ({ page }) => {
    const groups = await getLayerGroups(page);
    const knownGroupIds = new Set(LAYER_GROUPS.map((g) => g.id));
    for (const key of Object.keys(groups)) {
      expect(knownGroupIds.has(key as never)).toBeTruthy();
    }
  });

  // ── Toggle behaviour ─────────────────────────────────────────────────────

  test('terrain toggle starts on', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Toggle Terrain' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('water toggle starts on', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Toggle Water' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('clicking a toggle flips its checked state', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Toggle Water' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  test('Road Names toggle starts on', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Toggle Road Names' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('Road Names toggle reflects visibility in map layer state', async ({ page }) => {
    const allVisible = await page.evaluate(() => {
      const map = (window as Record<string, unknown>)['__layerLabMap'] as {
        getLayoutProperty: (id: string, prop: string) => string;
      };
      const groups = (window as Record<string, unknown>)['__layerLabGroups'] as Record<string, string[]>;
      return (groups['roadNames'] ?? []).every(
        (id) => map.getLayoutProperty(id, 'visibility') === 'visible',
      );
    });
    expect(allVisible).toBe(true);
  });

  // ── City switching ────────────────────────────────────────────────────────

  test('switching city updates the active city card', async ({ page }) => {
    await page.getByRole('combobox').selectOption('osaka');
    await expect(page.locator('[class*="cityCardName"]')).toHaveText('Osaka');
  });

  // ── No critical console errors ────────────────────────────────────────────

  test('no MapLibre errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') { errors.push(msg.text()); }
    });

    await page.goto('/layer-lab');
    await waitForMapReady(page);

    // Filter out known benign errors (e.g. browser extension noise)
    const criticalErrors = errors.filter(
      (e) => /maplibre|maptiler|setLayoutProperty|setTerrain/i.test(e),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
