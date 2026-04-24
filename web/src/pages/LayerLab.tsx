import { useEffect, useRef, useState } from 'react';
import { Map as MapGL, Marker, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LayerGroupId } from '../components/CityRevealMap/layers';
import { CITY_REVEAL_CITIES } from '@shared/cityRevealCities';
import type { CityRevealCity } from '@shared/cityRevealTypes';
import { flagEmoji } from '@shared/cityRevealTypes';
import {
  STYLE_URL,
  setupMapLayers,
  fetchWikiThumb,
  createPhotoMarkerEl,
} from '../lib/cityRevealMap';
import styles from './LayerLab.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const ZOOM_PRESETS = [
  { label: 'Region', zoom: 9 },
  { label: 'City', zoom: 11 },
  { label: 'District', zoom: 13 },
  { label: 'Street', zoom: 15 },
];

/** The 5 game reveal stages, in reveal order. */
const GAME_STAGES = [
  { id: 'terrain', icon: '⛰️', label: 'Terrain', groupIds: ['terrain'] as LayerGroupId[], isMarkers: false },
  { id: 'water', icon: '💧', label: 'Water', groupIds: ['water'] as LayerGroupId[], isMarkers: false },
  { id: 'roads', icon: '🛣️', label: 'Roads & Railways', groupIds: ['majorRoads', 'streetGrid', 'railways'] as LayerGroupId[], isMarkers: false },
  { id: 'landmarks', icon: '📍', label: 'Landmarks', groupIds: [] as LayerGroupId[], isMarkers: true },
  { id: 'roadNames', icon: '🔤', label: 'Road Names', groupIds: ['roadNames'] as LayerGroupId[], isMarkers: false },
] as const;

type StageId = typeof GAME_STAGES[number]['id'];
type StageVisibility = Record<StageId, boolean>;

const INITIAL_VISIBILITY: StageVisibility = {
  terrain: true,
  water: false,
  roads: false,
  landmarks: false,
  roadNames: false,
};

// Sorted: verified cities first (alphabetically), then unverified (alphabetically)
const SORTED_CITIES = [...CITY_REVEAL_CITIES].sort((a, b) => {
  if (a.implemented && !b.implemented) { return -1; }
  if (!a.implemented && b.implemented) { return 1; }
  return a.name.localeCompare(b.name);
});

// ── Main component ─────────────────────────────────────────────────────────────

export function LayerLab() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapGL | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const layerMapRef = useRef<Partial<Record<LayerGroupId, string[]>>>({});

  const [activeCity, setActiveCity] = useState<CityRevealCity>(SORTED_CITIES[0]);
  const [stageVisibility, setStageVisibility] = useState<StageVisibility>(INITIAL_VISIBILITY);
  const [zoom, setZoom] = useState<number>(SORTED_CITIES[0].zoom);
  const [mapReady, setMapReady] = useState(false);
  const [landmarkImages, setLandmarkImages] = useState<Record<string, string>>({});
  const [selectedLandmark, setSelectedLandmark] = useState<{ label: string; imageUrl: string } | null>(null);

  // ── Close modal on Escape ──────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSelectedLandmark(null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Fetch Wikipedia thumbnails for active city landmarks ───────────────────

  useEffect(() => {
    for (const lm of activeCity.landmarks) {
      if (landmarkImages[lm.wikiTitle]) { continue; }
      if (lm.thumbnailUrl) {
        setLandmarkImages((prev) => ({ ...prev, [lm.wikiTitle]: lm.thumbnailUrl! }));
        continue;
      }
      fetchWikiThumb(lm.wikiTitle)
        .then((url) => {
          if (url) { setLandmarkImages((prev) => ({ ...prev, [lm.wikiTitle]: url })); }
        });
    }
  }, [activeCity]); // landmarkImages intentionally excluded — used as a cache, not a trigger

  // ── Initialise map once ────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) { return; }

    const map = new MapGL({
      container: mapContainerRef.current,
      style: STYLE_URL,
      center: [activeCity.lon, activeCity.lat],
      zoom: activeCity.zoom,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl(), 'top-right');

    map.on('load', () => {
      layerMapRef.current = setupMapLayers(map);

      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>)['__layerLabGroups'] = layerMapRef.current;
        (window as unknown as Record<string, unknown>)['__layerLabMap'] = map;
      }

      setMapReady(true);
    });

    map.on('zoom', () => { setZoom(Math.round(map.getZoom() * 10) / 10); });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // map is initialised once; city/stage changes handled by separate effects

  // ── Sync stage layer visibility ────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) { return; }

    for (const stage of GAME_STAGES) {
      if (stage.isMarkers) { continue; }
      const visible = stageVisibility[stage.id];
      for (const groupId of stage.groupIds) {
        for (const id of layerMapRef.current[groupId] ?? []) {
          try {
            map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
          } catch (err) {
            console.error(`[LayerLab] stage visibility failed for "${id}":`, err);
          }
        }
      }
    }
  }, [stageVisibility, mapReady]);

  // ── Landmark markers ───────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) { return; }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!stageVisibility.landmarks) { return; }

    for (const lm of activeCity.landmarks) {
      const imageUrl = lm.thumbnailUrl ?? landmarkImages[lm.wikiTitle] ?? null;
      const onClick = imageUrl
        ? () => setSelectedLandmark({ label: lm.label, imageUrl })
        : undefined;
      const marker = new Marker({ element: createPhotoMarkerEl(imageUrl, onClick), anchor: 'center' })
        .setLngLat([lm.lon, lm.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [activeCity, stageVisibility.landmarks, mapReady, landmarkImages]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCityChange(city: CityRevealCity) {
    setActiveCity(city);
    setStageVisibility(INITIAL_VISIBILITY);
    mapRef.current?.flyTo({ center: [city.lon, city.lat], zoom: city.zoom, duration: 1400 });
  }

  function handleFlyToCity() {
    mapRef.current?.flyTo({ center: [activeCity.lon, activeCity.lat], zoom: activeCity.zoom, duration: 800 });
  }

  function handleZoomPreset(z: number) {
    mapRef.current?.easeTo({ zoom: z, duration: 500 });
  }

  function handleZoomSlider(e: React.ChangeEvent<HTMLInputElement>) {
    mapRef.current?.easeTo({ zoom: parseFloat(e.target.value), duration: 150 });
  }

  function handleStageToggle(stageId: StageId) {
    setStageVisibility((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <header className={styles.header}>
          <h1 className={styles.title}>Maple Lab</h1>
          <p className={styles.subtitle}>Verify zoom & landmarks before enabling</p>
        </header>

        {/* ── City selector ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>City</h2>
          <select
            className={styles.citySelect}
            value={activeCity.id}
            onChange={(e) => {
              const city = CITY_REVEAL_CITIES.find((c) => c.id === e.target.value);
              if (city) { handleCityChange(city); }
            }}
          >
            <optgroup label="✅ Verified">
              {SORTED_CITIES.filter((c) => c.implemented).map((c) => (
                <option key={c.id} value={c.id}>{c.name}, {c.country}</option>
              ))}
            </optgroup>
            <optgroup label="🔍 Needs verification">
              {SORTED_CITIES.filter((c) => !c.implemented).map((c) => (
                <option key={c.id} value={c.id}>{c.name}, {c.country}</option>
              ))}
            </optgroup>
          </select>

          {/* City info card */}
          <div className={styles.cityCard}>
            <div className={styles.cityCardHeader}>
              <span className={styles.cityFlag}>{flagEmoji(activeCity.countryCode)}</span>
              <div>
                <div className={styles.cityCardName}>{activeCity.name}</div>
                <div className={styles.cityCardCountry}>{activeCity.country}</div>
              </div>
              <span className={`${styles.implBadge} ${activeCity.implemented ? styles.implBadgeYes : styles.implBadgeNo}`}>
                {activeCity.implemented ? '✅ Live' : '🔍 Draft'}
              </span>
            </div>
            <div className={styles.cityCardMeta}>
              <span>zoom {activeCity.zoom}</span>
              <span>{activeCity.lat.toFixed(3)}, {activeCity.lon.toFixed(3)}</span>
              <span>{activeCity.landmarks.length} landmarks</span>
            </div>
          </div>
        </section>

        {/* ── Reveal stages ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Reveal stages</h2>
          <div className={styles.layerList}>
            {GAME_STAGES.map((stage) => (
              <div
                key={stage.id}
                className={styles.layerRow}
                onClick={() => handleStageToggle(stage.id)}
              >
                <span className={styles.stageIcon}>{stage.icon}</span>
                <span className={styles.layerLabel}>{stage.label}</span>
                <button
                  role="switch"
                  aria-checked={stageVisibility[stage.id]}
                  aria-label={`Toggle ${stage.label}`}
                  className={`${styles.toggle} ${stageVisibility[stage.id] ? styles.toggleOn : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleStageToggle(stage.id); }}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── Zoom ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Zoom
            <span className={styles.zoomValue}> z{zoom.toFixed(1)}</span>
          </h2>
          <div className={styles.zoomPresets}>
            {ZOOM_PRESETS.map((p) => (
              <button key={p.zoom} className={styles.zoomPresetBtn} onClick={() => handleZoomPreset(p.zoom)}>
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
          <button className={styles.flyBtn} onClick={handleFlyToCity}>
            ↩ Fly to city zoom ({activeCity.zoom})
          </button>
        </section>

        {/* ── Landmark reference ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Landmarks</h2>
          <div className={styles.landmarkList}>
            {activeCity.landmarks.map((lm) => (
              <div key={lm.wikiTitle} className={styles.landmarkItem}>
                <span className={styles.landmarkLabel}>{lm.label}</span>
                <span className={styles.landmarkWiki}>{lm.wikiTitle}</span>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <div ref={mapContainerRef} className={styles.map} data-testid="layer-lab-map" />

      {selectedLandmark && (
        <div className={styles.modalOverlay} onClick={() => setSelectedLandmark(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setSelectedLandmark(null)} aria-label="Close">✕</button>
            <img className={styles.modalImg} src={selectedLandmark.imageUrl} alt={selectedLandmark.label} />
            <p className={styles.modalLabel}>{selectedLandmark.label}</p>
          </div>
        </div>
      )}
    </div>
  );
}
