import { useEffect, useRef, useState } from 'react';
import { Map as MapGL, Marker, NavigationControl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LAYER_GROUPS, LayerGroupId, classifyLayer } from '../components/CityRevealMap/layers';
import { LAB_CITIES, LabCity, type CuratedLabel } from '../data/layerLabCities';
import styles from './LayerLab.module.css';

const CURATED_LABELS_SOURCE = 'curated-labels';
const CURATED_LABELS_LAYER = 'curated-labels';

function buildCuratedLabelGeoJSON(labels: CuratedLabel[]) {
  return {
    type: 'FeatureCollection' as const,
    features: labels.map((l) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [l.lon, l.lat] },
      properties: { text: l.text },
    })),
  };
}

// streets-v2 is better for urban city identification:
// separate road-class layers, clear building data, standard urban POIs
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`;

const ZOOM_PRESETS = [
  { label: 'Regional', zoom: 9 },
  { label: 'City', zoom: 11 },
  { label: 'District', zoom: 13 },
  { label: 'Street', zoom: 15 },
];

type LayerVisibility = Record<LayerGroupId, boolean>;

function buildDefaultVisibility(): LayerVisibility {
  return Object.fromEntries(
    LAYER_GROUPS.map((g) => [g.id, g.defaultVisible]),
  ) as LayerVisibility;
}

/** Creates a circular photo marker element for always-visible landmark display */
function createPhotoMarkerEl(imageUrl: string | null): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    overflow: 'hidden',
    border: '2.5px solid #ffffff',
    boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
    backgroundColor: '#23263a',
    cursor: 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '';
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
    img.onerror = () => {
      img.remove();
      el.textContent = '📍';
      Object.assign(el.style, { fontSize: '22px' });
    };
    el.appendChild(img);
  } else {
    el.textContent = '⏳';
    Object.assign(el.style, { fontSize: '18px', color: '#8b8fa8' });
  }

  return el;
}

export function LayerLab() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapGL | null>(null);
  const markersRef = useRef<Marker[]>([]);
  // Maps each LayerGroupId to the array of MapLibre layer IDs classified into it
  const layerMapRef = useRef<Partial<Record<LayerGroupId, string[]>>>({});

  const [activeCity, setActiveCity] = useState<LabCity>(LAB_CITIES[0]);
  const [zoom, setZoom] = useState<number>(LAB_CITIES[0].zoom);
  const [pitch, setPitch] = useState<number>(0);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(buildDefaultVisibility);
  const [mapReady, setMapReady] = useState(false);
  // wikiTitle → fetched thumbnail URL
  const [landmarkImages, setLandmarkImages] = useState<Record<string, string>>({});

  // Pre-fetch Wikipedia thumbnails for all cities on mount
  useEffect(() => {
    const allLandmarks = LAB_CITIES.flatMap((c) => c.landmarks);
    for (const lm of allLandmarks) {
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(lm.wikiTitle)}`)
        .then((r) => {
          if (!r.ok) { throw new Error(`HTTP ${r.status}`); }
          return r.json() as Promise<{ thumbnail?: { source: string } }>;
        })
        .then((data) => {
          if (data.thumbnail?.source) {
            setLandmarkImages((prev) => ({ ...prev, [lm.wikiTitle]: data.thumbnail!.source }));
          }
        })
        .catch((err) => console.warn(`[LayerLab] No Wikipedia image for "${lm.wikiTitle}":`, err));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise the map once on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new MapGL({
      container: mapContainerRef.current,
      style: STYLE_URL,
      center: [activeCity.lon, activeCity.lat],
      zoom: activeCity.zoom,
      pitch: 0,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl(), 'top-right');

    map.on('load', () => {
      const grouped: Partial<Record<LayerGroupId, string[]>> = {};
      LAYER_GROUPS.forEach((g) => {
        grouped[g.id] = [];
      });

      for (const layer of map.getStyle().layers) {
        // Pass source-layer so place-name symbols are separated from street-name symbols
        const sourceLayer = (layer as Record<string, unknown>)['source-layer'] as string | undefined;
        const group = classifyLayer(layer.id, layer.type, sourceLayer);
        if (group) {
          grouped[group]!.push(layer.id);
        }
      }
      layerMapRef.current = grouped;

      // Apply initial visibility state from defaults.
      // MapTiler 'labels' layers are permanently hidden — replaced by curated GeoJSON labels.
      for (const group of LAYER_GROUPS) {
        const visibility = group.id === 'labels' || !group.defaultVisible ? 'none' : 'visible';
        for (const id of grouped[group.id] ?? []) {
          try {
            map.setLayoutProperty(id, 'visibility', visibility);
          } catch (err) {
            console.error(`[LayerLab] setLayoutProperty failed for "${id}":`, err);
          }
        }
      }

      // Curated GeoJSON labels replace the raw MapTiler transportation/POI labels.
      // Using Noto Sans for broad script support (Cyrillic, CJK, Latin, etc.)
      map.addSource(CURATED_LABELS_SOURCE, {
        type: 'geojson',
        data: buildCuratedLabelGeoJSON(activeCity.curatedLabels),
      });
      map.addLayer({
        id: CURATED_LABELS_LAYER,
        type: 'symbol',
        source: CURATED_LABELS_SOURCE,
        layout: {
          'text-field': ['get', 'text'],
          'text-size': 13,
          'text-font': ['Noto Sans Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-anchor': 'center',
          'text-max-width': 10,
          'text-allow-overlap': false,
          'text-padding': 8,
          visibility: 'none',
        },
        paint: {
          'text-color': '#444444',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });

      setMapReady(true);
    });

    map.on('zoom', () => {
      setZoom(Math.round(map.getZoom() * 10) / 10);
    });

    map.on('pitch', () => {
      setPitch(Math.round(map.getPitch()));
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update curated GeoJSON labels when city changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }
    const source = map.getSource(CURATED_LABELS_SOURCE) as GeoJSONSource | undefined;
    if (source) {
      source.setData(buildCuratedLabelGeoJSON(activeCity.curatedLabels));
    }
  }, [activeCity, mapReady]);

  // Sync layer visibility to the map whenever toggles change.
  // The 'labels' group controls the curated GeoJSON layer; MapTiler labels stay permanently hidden.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }
    for (const group of LAYER_GROUPS) {
      if (group.id === 'labels') {
        try {
          map.setLayoutProperty(
            CURATED_LABELS_LAYER,
            'visibility',
            layerVisibility.labels ? 'visible' : 'none',
          );
        } catch (err) {
          console.error('[LayerLab] curated-labels visibility failed:', err);
        }
        continue;
      }
      const visibility = layerVisibility[group.id] ? 'visible' : 'none';
      for (const id of layerMapRef.current[group.id] ?? []) {
        try {
          map.setLayoutProperty(id, 'visibility', visibility);
        } catch (err) {
          console.error(`[LayerLab] toggle setLayoutProperty failed for "${id}":`, err);
        }
      }
    }
  }, [layerVisibility, mapReady]);

  // Sync landmark markers whenever city, landmark toggle, or fetched images change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!layerVisibility.landmarks) {
      return;
    }

    for (const landmark of activeCity.landmarks) {
      const imageUrl = landmarkImages[landmark.wikiTitle] ?? null;
      const el = createPhotoMarkerEl(imageUrl);

      const marker = new Marker({ element: el, anchor: 'center' })
        .setLngLat([landmark.lon, landmark.lat])
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [activeCity, layerVisibility.landmarks, mapReady, landmarkImages]);

  function handleCityChange(city: LabCity) {
    setActiveCity(city);
    mapRef.current?.flyTo({ center: [city.lon, city.lat], zoom: city.zoom, duration: 1400 });
  }

  function handleZoomPreset(z: number) {
    mapRef.current?.easeTo({ zoom: z, duration: 500 });
  }

  function handleZoomSlider(e: React.ChangeEvent<HTMLInputElement>) {
    mapRef.current?.easeTo({ zoom: parseFloat(e.target.value), duration: 150 });
  }

  function handlePitchToggle() {
    const next = pitch > 0 ? 0 : 45;
    mapRef.current?.easeTo({ pitch: next, duration: 500 });
  }

  function handleToggle(groupId: LayerGroupId) {
    setLayerVisibility((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }

  const layerCounts = mapReady ? layerMapRef.current : {};

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <header className={styles.header}>
          <h1 className={styles.title}>Layer Lab</h1>
          <p className={styles.subtitle}>Dev prototype — not a game</p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>City</h2>
          <div className={styles.cityGrid}>
            {LAB_CITIES.map((city) => (
              <button
                key={city.id}
                className={`${styles.cityBtn} ${activeCity.id === city.id ? styles.cityBtnActive : ''}`}
                onClick={() => handleCityChange(city)}
              >
                {city.name}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Layers</h2>
          <div className={styles.layerList}>
            {LAYER_GROUPS.map((group) => (
              <div key={group.id} className={styles.layerRow} onClick={() => handleToggle(group.id)}>
                <span className={styles.layerInfo}>
                  <span className={styles.layerLabel}>
                    {group.label}
                    {group.alwaysHiddenInGame && (
                      <span className={styles.spoilerBadge}>reveals city</span>
                    )}
                  </span>
                  <span className={styles.layerDesc}>
                    {group.description}
                    {group.id !== 'labels' && layerCounts[group.id] !== undefined && (
                      <span className={styles.layerCount}> · {layerCounts[group.id]!.length}</span>
                    )}
                  </span>
                </span>
                <button
                  role="switch"
                  aria-checked={layerVisibility[group.id]}
                  aria-label={`Toggle ${group.label}`}
                  className={`${styles.toggle} ${layerVisibility[group.id] ? styles.toggleOn : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(group.id);
                  }}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Zoom
            <span className={styles.zoomValue}> z{zoom.toFixed(1)}</span>
          </h2>
          <div className={styles.zoomPresets}>
            {ZOOM_PRESETS.map((p) => (
              <button
                key={p.zoom}
                className={styles.zoomPresetBtn}
                onClick={() => handleZoomPreset(p.zoom)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min="7"
            max="17"
            step="0.5"
            value={zoom}
            onChange={handleZoomSlider}
            className={styles.zoomSlider}
            aria-label="Zoom level"
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Perspective</h2>
          <div className={styles.perspectiveRow}>
            <span className={styles.layerDesc}>
              {pitch > 0 ? `${pitch}° tilt (good for 3D buildings)` : 'Top-down (2D)'}
            </span>
            <button
              role="switch"
              aria-checked={pitch > 0}
              aria-label="Toggle 3D perspective"
              className={`${styles.toggle} ${pitch > 0 ? styles.toggleOn : ''}`}
              onClick={handlePitchToggle}
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>
        </section>
      </aside>

      <div ref={mapContainerRef} className={styles.map} data-testid="layer-lab-map" />
    </div>
  );
}
