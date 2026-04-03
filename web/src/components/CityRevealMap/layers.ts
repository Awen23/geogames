export type LayerGroupId =
  | 'terrain'
  | 'contours'
  | 'terrain3d'
  | 'water'
  | 'urbanFabric'
  | 'buildings'
  | 'majorRoads'
  | 'roadNames'
  | 'streetGrid'
  | 'railways'
  | 'landmarks'
  | 'labels'
  | 'districtLabels'
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
    description: 'Hillshade and natural land cover',
    defaultVisible: true,
  },
  {
    id: 'contours',
    label: 'Contour Lines',
    description: 'Elevation contour lines',
    defaultVisible: false,
  },
  {
    id: 'terrain3d',
    label: '3D Terrain',
    description: 'Raises the map surface with real elevation — best with tilt',
    defaultVisible: false,
  },
  {
    id: 'water',
    label: 'Water',
    description: 'Rivers, lakes, ocean fill',
    defaultVisible: false,
  },
  {
    id: 'urbanFabric',
    label: 'Urban Fabric',
    description: 'Residential, commercial and industrial zone fills',
    defaultVisible: false,
  },
  {
    id: 'buildings',
    label: 'Buildings',
    description: 'Building footprints (2D)',
    defaultVisible: false,
  },
  {
    id: 'majorRoads',
    label: 'Major Roads',
    description: 'Motorways, primary roads',
    defaultVisible: false,
  },
  {
    id: 'roadNames',
    label: 'Road Names',
    description: 'Highway shields and major road name labels',
    defaultVisible: false,
  },
  {
    id: 'streetGrid',
    label: 'Street Grid',
    description: 'Secondary streets, residential roads, footways',
    defaultVisible: false,
  },
  {
    id: 'railways',
    label: 'Railways',
    description: 'Rail, metro and transit lines',
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
    label: 'Street Labels',
    description: '6 curated street/square names',
    defaultVisible: false,
  },
  {
    id: 'districtLabels',
    label: 'District Names',
    description: 'Neighbourhood and suburb names (safe — no city name)',
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
 * minzoom is the layer's minimum zoom level from the style definition.
 *
 * Returns null for layers that should always remain visible (background,
 * unrecognised fills that make up the base land appearance).
 */
export function classifyLayer(
  layerId: string,
  layerType: string,
  sourceLayer?: string,
  minzoom?: number,
): LayerGroupId | null {
  const id = layerId.toLowerCase();

  // Background — always visible; removing it blanks the map
  if (id === 'background') {
    return null;
  }

  // Symbol layers: split by source-layer.
  // Handles both OpenMapTiles v2 naming (streets-v2, outdoor-v2) and
  // MapTiler v4 naming (streets-v4) which uses different source-layer names.
  if (layerType === 'symbol') {
    // ── City / country / region names — always hidden in game (reveals the answer) ──
    // v2: source-layer "place" or "place_label"
    // v4: separate source-layers per level: city_label, country_label, town_label, etc.
    const isCityOrCountryLayer =
      sourceLayer === 'place' ||
      sourceLayer === 'city_label' ||
      sourceLayer === 'country_label' ||
      sourceLayer === 'country_disputed_label' ||
      sourceLayer === 'continent_label' ||
      sourceLayer === 'archipelago_label' ||
      sourceLayer === 'island_label' ||
      sourceLayer === 'state_label' ||
      sourceLayer === 'town_label';

    if (isCityOrCountryLayer) {
      return 'placeLabels';
    }

    // ── Neighbourhood / suburb names — safe to reveal (don't contain the city name) ──
    // v2: source-layer "place_label" with minzoom >= 10 are sub-city level
    if (sourceLayer === 'place_label') {
      const isSubCityLevel =
        (minzoom !== undefined && minzoom >= 10) ||
        /suburb|neighbourhood|neighborhood|quarter|district|locality/.test(id);
      return isSubCityLevel ? 'districtLabels' : 'placeLabels';
    }

    // ── Road name labels and highway shields ──
    // v2: transportation_name   v4: road_label
    if (sourceLayer === 'transportation_name' || sourceLayer === 'road_label') {
      return 'roadNames';
    }

    // ── Contour elevation labels ──
    if (sourceLayer === 'contour') {
      return 'contours';
    }

    // Everything else (POIs, building numbers, water names, ferry labels, etc.)
    // goes into the permanently-hidden pool — our curated GeoJSON labels replace them.
    return 'labels';
  }

  // Hillshade: MapTiler outdoor-v2 uses type 'hillshade' (not 'raster')
  if (layerType === 'raster' || layerType === 'hillshade') {
    return 'terrain';
  }

  // 3D extruded buildings — classified but filtered to 2D-only in LayerLab
  if (layerType === 'fill-extrusion') {
    return 'buildings';
  }

  // Water: rivers, lakes, ocean, sea, reservoirs, aqueducts
  if (/water|river|lake|ocean|reservoir|canal|swimming.pool|aqueduct/.test(id)) {
    // Underground waterways in tunnel context belong with the street grid
    if (/river.tunnel|water.tunnel/.test(id)) {
      return 'streetGrid';
    }
    return 'water';
  }

  // Urban fabric: man-made land-use zone fills (checked before terrain to avoid overlap)
  if (/\bresidential\b|\bindustrial\b|\bcommercial\b|\bmilitary\b|\bcemetery\b|\bhospital\b|\bstadium\b|\bschool\b|\bcollege\b|\buniversity\b/.test(id)) {
    return 'urbanFabric';
  }

  // Contour lines — separate toggle so they can be layered on top of anything
  if (/contour/.test(id)) {
    return 'contours';
  }

  // Terrain: topographic and natural land-cover features
  if (/hillshade|cliff|glacier|scrub|tree|forest|wood|grass|sand|park|landcover|landuse|wetland|meadow|farmland|border|boundary|admin|crop/.test(id)) {
    return 'terrain';
  }

  // Building footprints
  if (/building/.test(id)) {
    return 'buildings';
  }

  // Railways — checked before roads because "railway" contains "way"
  if (/railway|\brail\b|transit|metro|tram|subway/.test(id)) {
    return 'railways';
  }

  // Major roads: motorways, trunk, primary, secondary, airports + highway class
  if (/motorway|trunk|primary|secondary|highway|aeroway|runway|taxiway|airport|heliport/.test(id)) {
    return 'majorRoads';
  }

  // Street grid: all other surface/underground transport
  if (/road|street|tunnel|bridge|pier|steps|pedestrian|path|track|trail|ferrata|lift|chair|cable|aerialway|ferry/.test(id)) {
    return 'streetGrid';
  }

  // Unrecognised layers stay always visible (safe default)
  return null;
}
