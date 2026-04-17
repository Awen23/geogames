/**
 * Shared map setup utilities for the City Reveal game and Layer Lab.
 *
 * Both pages use the same MapTiler style, the same DEM/hillshade configuration,
 * the same layer classification, and the same initial visibility rules. Keeping
 * them here means a single change benefits both.
 */

import type { Map as MapGL } from 'maplibre-gl';
import { LAYER_GROUPS, classifyLayer } from '../components/CityRevealMap/layers';
import type { LayerGroupId } from '../components/CityRevealMap/layers';

// ── Map style / source constants ──────────────────────────────────────────────

export const STYLE_URL = `https://api.maptiler.com/maps/streets-v4/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`;
export const TERRAIN_DEM_SOURCE = 'city-reveal-dem';
export const CUSTOM_HILLSHADE_LAYER = 'city-reveal-hillshade';

// ── Stage → layer-group mappings ──────────────────────────────────────────────

const ROADS_AND_BELOW: LayerGroupId[] = ['terrain', 'water', 'majorRoads', 'streetGrid', 'railways'];

/** Layer groups that are visible at each wrong-guess stage (cumulative). */
export const STAGE_GROUPS: Record<number, LayerGroupId[]> = {
  0: ['terrain'],
  1: ['terrain', 'water'],
  2: ROADS_AND_BELOW,
  3: ROADS_AND_BELOW, // landmarks revealed via markers, not layer groups
  4: [...ROADS_AND_BELOW, 'roadNames'],
};

/** All layer groups revealed when the player wins. */
export const WIN_GROUPS: LayerGroupId[] = [
  'terrain', 'water', 'majorRoads', 'streetGrid', 'railways',
  'roadNames', 'urbanFabric', 'buildings', 'districtLabels', 'contours',
];

/** Banner text shown in-game after each wrong guess reveals a new layer. */
export const STAGE_REVEAL_LABELS: Record<number, string> = {
  1: '💧 Water revealed',
  2: '🛣️ Roads & railways revealed',
  3: '📍 Landmarks revealed',
  4: '🔤 Road names revealed',
};

// ── Map initialisation ────────────────────────────────────────────────────────

/**
 * Sets up all City Reveal layers inside a MapLibre `map.on('load')` callback.
 *
 * Steps performed:
 *   1. Classify all style layers into LayerGroupId buckets.
 *   2. Add DEM raster-dem source + custom hillshade layer (placed below roads).
 *   3. Filter 2D-only buildings (remove fill-extrusion).
 *   4. Lower minzoom for road/railway groups so they render at city zoom levels
 *      (streets-v4 has minor roads at minzoom 13-14; we force them visible from 9).
 *   5. Set initial visibility: only `terrain` group visible; everything else hidden.
 *
 * Returns the populated grouped layer map so the caller can apply further
 * stage-based visibility updates.
 */
export function setupMapLayers(map: MapGL): Partial<Record<LayerGroupId, string[]>> {
  const grouped: Partial<Record<LayerGroupId, string[]>> = {};
  for (const g of LAYER_GROUPS) { grouped[g.id] = []; }

  // 1. Classify existing style layers
  for (const layer of map.getStyle().layers) {
    const raw = layer as Record<string, unknown>;
    const sourceLayer = raw['source-layer'] as string | undefined;
    const minzoom = raw['minzoom'] as number | undefined;
    const group = classifyLayer(layer.id, layer.type, sourceLayer, minzoom);
    if (group !== null) { grouped[group]!.push(layer.id); }
  }

  // 2. Add DEM source + hillshade below the first road layer
  map.addSource(TERRAIN_DEM_SOURCE, {
    type: 'raster-dem',
    url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`,
    tileSize: 256,
    maxzoom: 12,
  });
  const firstRoadId = (grouped['majorRoads'] ?? [])[0] ?? (grouped['streetGrid'] ?? [])[0];
  map.addLayer(
    {
      id: CUSTOM_HILLSHADE_LAYER,
      type: 'hillshade',
      source: TERRAIN_DEM_SOURCE,
      paint: {
        'hillshade-exaggeration': 0.25,
        'hillshade-shadow-color': 'rgba(45,30,15,0.22)',
        'hillshade-highlight-color': 'rgba(255,252,235,0.09)',
        'hillshade-illumination-direction': 335,
        'hillshade-illumination-anchor': 'map',
      },
      layout: { visibility: 'visible' },
    },
    firstRoadId,
  );
  // Prepend so hillshade is first when iterating terrain group layers
  grouped['terrain']!.unshift(CUSTOM_HILLSHADE_LAYER);

  // 3. Filter 2D-only buildings and lower minzoom so they appear at game zoom levels.
  //    streets-v4 default minzoom for buildings is ~14-15; win-state reveals them at
  //    whatever zoom the city uses (often 11-13), so we force them visible from zoom 13.
  if (grouped['buildings']) {
    grouped['buildings'] = grouped['buildings'].filter((id) => {
      return map.getLayer(id)?.type !== 'fill-extrusion';
    });
    for (const id of grouped['buildings']) {
      try {
        map.setLayerZoomRange(id, 13, 24);
      } catch (err) {
        console.warn(`[cityRevealMap] setLayerZoomRange failed for building "${id}":`, err);
      }
    }
  }

  // 4. Lower minzoom for road and railway groups.
  //    streets-v4 hides minor roads below zoom 13-14 in tile data; we force
  //    them visible from zoom 9 so they appear at all valid city zoom levels.
  const zoomExpandGroups: LayerGroupId[] = ['majorRoads', 'streetGrid', 'railways'];
  for (const groupId of zoomExpandGroups) {
    for (const id of grouped[groupId] ?? []) {
      try {
        map.setLayerZoomRange(id, 9, 24);
      } catch (err) {
        console.warn(`[cityRevealMap] setLayerZoomRange failed for "${id}":`, err);
      }
    }
  }

  // 5. Set initial visibility: only terrain visible; all other classified groups hidden.
  //    This includes labels/placeLabels which must stay hidden to avoid naming the city.
  const initialVisible = new Set<string>(STAGE_GROUPS[0]);
  for (const group of LAYER_GROUPS) {
    const visibility = initialVisible.has(group.id) ? 'visible' : 'none';
    for (const id of grouped[group.id] ?? []) {
      try {
        map.setLayoutProperty(id, 'visibility', visibility);
      } catch (err) {
        console.warn(`[cityRevealMap] setLayoutProperty visibility failed for "${id}":`, err);
      }
    }
  }

  return grouped;
}

// ── Landmark / photo-marker utilities ─────────────────────────────────────────

/** Fetches a Wikipedia article thumbnail URL. Returns null on failure (and logs a warning). */
export async function fetchWikiThumb(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[cityRevealMap] Wikipedia thumbnail not available for "${title}": HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as { thumbnail?: { source: string } };
    return data.thumbnail?.source ?? null;
  } catch (err) {
    console.warn(`[cityRevealMap] Wikipedia fetch failed for "${title}":`, err);
    return null;
  }
}

/**
 * Creates the HTML element used for a landmark photo marker.
 *
 * The outer div is left unstyled so MapLibre can freely manage its transform.
 * All visual treatment and interactions live on the inner div to avoid
 * transform conflicts with MapLibre's marker positioning.
 */
export function createPhotoMarkerEl(imageUrl: string | null, onClick?: () => void): HTMLDivElement {
  const el = document.createElement('div');
  const inner = document.createElement('div');
  Object.assign(inner.style, {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    overflow: 'hidden',
    border: '2.5px solid #ffffff',
    boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
    backgroundColor: '#23263a',
    cursor: onClick ? 'pointer' : 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.15s, box-shadow 0.15s',
  });

  if (onClick) {
    inner.addEventListener('mouseenter', () => {
      inner.style.transform = 'scale(1.08)';
      inner.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)';
    });
    inner.addEventListener('mouseleave', () => {
      inner.style.transform = '';
      inner.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
    });
    inner.addEventListener('click', onClick);
  }

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '';
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
    img.onerror = () => {
      img.remove();
      inner.textContent = '📍';
      Object.assign(inner.style, { fontSize: '20px' });
    };
    inner.appendChild(img);
  } else {
    inner.textContent = '⏳';
    Object.assign(inner.style, { fontSize: '18px', color: '#8b8fa8' });
  }

  el.appendChild(inner);
  return el;
}
