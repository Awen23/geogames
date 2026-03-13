export type LayerGroupId =
  | 'terrain'
  | 'water'
  | 'buildings'
  | 'roads'
  | 'landmarks'
  | 'labels'
  | 'placeLabels';

export interface LayerGroup {
  id: LayerGroupId;
  label: string;
  description: string;
  defaultVisible: boolean;
  /** If true, this group must never be revealed during gameplay (it gives away the city). */
  alwaysHiddenInGame?: boolean;
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
    label: 'Street Names',
    description: 'Road/street labels — hint at language and naming style',
    defaultVisible: false,
  },
  {
    id: 'placeLabels',
    label: 'Place Names',
    description: 'City, country and admin labels — reveals the answer',
    defaultVisible: false,
    alwaysHiddenInGame: true,
  },
];

/**
 * Classify a MapLibre layer into a game reveal group.
 *
 * ID matching is done lowercase to handle both snake_case OpenMapTiles IDs
 * ("waterway") and the human-readable title-case IDs MapTiler uses ("Road network").
 *
 * sourceLayer is the vector tile source-layer (e.g. "transportation_name", "place").
 * It is used to split symbol layers into street labels vs place-name labels, which
 * is critical for the game — place labels reveal the city name and must stay hidden.
 *
 * Returns null for layers that should always remain visible (background,
 * unrecognised fills that make up the base land appearance).
 */
export function classifyLayer(layerId: string, layerType: string, sourceLayer?: string): LayerGroupId | null {
  const id = layerId.toLowerCase();

  // Background — always visible; removing it blanks the map
  if (id === 'background') {
    return null;
  }

  // Symbol layers: split by source-layer to separate city/country names from street names.
  // OpenMapTiles uses source-layer "place" for admin/city/country labels.
  // Everything else (transportation_name, poi, housenumber, waterway, …) is street-level.
  if (layerType === 'symbol') {
    if (sourceLayer === 'place' || sourceLayer === 'place_label') {
      return 'placeLabels';
    }
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
