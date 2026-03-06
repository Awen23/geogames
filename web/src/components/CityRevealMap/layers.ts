export type LayerGroupId =
  | 'terrain'
  | 'water'
  | 'buildings'
  | 'roads'
  | 'landmarks'
  | 'labels';

export interface LayerGroup {
  id: LayerGroupId;
  label: string;
  description: string;
  defaultVisible: boolean;
}

export const LAYER_GROUPS: LayerGroup[] = [
  {
    id: 'terrain',
    label: 'Terrain',
    description: 'Hillshade, contours, land cover',
    defaultVisible: true,
  },
  {
    id: 'water',
    label: 'Water',
    description: 'Rivers, lakes, ocean fill',
    defaultVisible: false,
  },
  {
    id: 'buildings',
    label: 'Buildings',
    description: 'Building footprints and 3D heights',
    defaultVisible: false,
  },
  {
    id: 'roads',
    label: 'Roads',
    description: 'Road network, paths, transport links',
    defaultVisible: false,
  },
  {
    id: 'landmarks',
    label: 'Landmarks',
    description: 'Famous places (photo markers)',
    defaultVisible: false,
  },
  {
    id: 'labels',
    label: 'Labels',
    description: 'Street names, POIs, place names',
    defaultVisible: false,
  },
];

/**
 * Classify a MapLibre layer ID into a game reveal group.
 *
 * All matching is done on the lowercase layer ID so it handles both
 * snake_case OpenMapTiles layers ("waterway") and the human-readable
 * title-case IDs used by MapTiler styles ("Water", "Road network", etc.)
 *
 * Returns null for layers that should always remain visible (background,
 * unrecognised fills that make up the base land appearance).
 */
export function classifyLayer(layerId: string, layerType: string): LayerGroupId | null {
  const id = layerId.toLowerCase();

  // Background — always visible; removing it blanks the map
  if (id === 'background') {
    return null;
  }

  // All symbol layers (text + icons) → labels group
  if (layerType === 'symbol') {
    return 'labels';
  }

  // Hillshade: MapTiler outdoor-v2 uses type 'hillshade' (not 'raster')
  if (layerType === 'raster' || layerType === 'hillshade') {
    return 'terrain';
  }

  // 3D extruded buildings
  if (layerType === 'fill-extrusion') {
    return 'buildings';
  }

  // Water: rivers, lakes, ocean, sea, reservoirs
  // Using \b word-boundaries where safe; 'river' / 'water' / 'lake' as substrings
  if (/water|river|lake|ocean|reservoir|canal|swimming.pool/.test(id)) {
    // Exclude "water" in purely underground/tunnel contexts that belong with roads
    if (/river.tunnel|water.tunnel/.test(id)) {
      return 'roads';
    }
    return 'water';
  }

  // Terrain: elevation features, land cover, land use zones, boundaries
  if (/hillshade|contour|cliff|glacier|scrub|tree|forest|wood|grass|sand|park|residential|industrial|commercial|military|cemetery|hospital|stadium|landcover|landuse|wetland|meadow|farmland|border|boundary|admin/.test(id)) {
    return 'terrain';
  }

  // Buildings (flat footprints — 3D extrusion caught above)
  if (/building/.test(id)) {
    return 'buildings';
  }

  // Roads and all surface/underground transport
  if (/road|highway|motorway|trunk|primary|secondary|street|tunnel|bridge|pier|steps|pedestrian|path|track|trail|ferrata|lift|chair|cable|aerialway|ferry|aeroway|runway|taxiway|railway|transit/.test(id)) {
    return 'roads';
  }

  // Unrecognised layers stay always visible (safe default)
  return null;
}
