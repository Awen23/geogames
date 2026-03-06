import { useEffect, useRef, useState } from 'react';
import { Map as MapGL, Marker, Popup, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LAYER_GROUPS, LayerGroupId, classifyLayer } from '../components/CityRevealMap/layers';
import { LAB_CITIES, LabCity } from '../data/layerLabCities';
import styles from './LayerLab.module.css';

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
        const group = classifyLayer(layer.id, layer.type);
        if (group) {
          grouped[group]!.push(layer.id);
        }
      }
      layerMapRef.current = grouped;

      // Apply initial visibility state from defaults
      for (const group of LAYER_GROUPS) {
        const visibility = group.defaultVisible ? 'visible' : 'none';
        for (const id of grouped[group.id] ?? []) {
          try {
            map.setLayoutProperty(id, 'visibility', visibility);
          } catch (err) {
            console.error(`[LayerLab] setLayoutProperty failed for "${id}":`, err);
          }
        }
      }

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

  // Sync layer visibility to the map whenever toggles change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }
    for (const group of LAYER_GROUPS) {
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

  // Sync landmark markers whenever city or landmark toggle changes
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
      const popup = new Popup({ offset: 25, maxWidth: '220px' }).setHTML(`
        <div style="text-align:center">
          <img
            src="${landmark.imageUrl}"
            alt="${landmark.name}"
            style="width:200px;height:130px;object-fit:cover;border-radius:6px;display:block;margin-bottom:6px"
          />
          <p style="font-size:0.75rem;color:#8b8fa8;margin:0">${landmark.name}</p>
        </div>
      `);

      const marker = new Marker({ color: '#5c6bc0' })
        .setLngLat([landmark.lon, landmark.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [activeCity, layerVisibility.landmarks, mapReady]);

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
                  <span className={styles.layerLabel}>{group.label}</span>
                  <span className={styles.layerDesc}>
                    {group.description}
                    {layerCounts[group.id] !== undefined && (
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
