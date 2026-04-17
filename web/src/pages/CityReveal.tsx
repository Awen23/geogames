import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Map as MapGL, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LAYER_GROUPS, classifyLayer } from '../components/CityRevealMap/layers';
import type { LayerGroupId } from '../components/CityRevealMap/layers';
import { CITY_REVEAL_CITIES } from '@shared/cityRevealCities';
import {
  flagEmoji,
  bearingToArrow,
  MAX_GUESSES,
} from '@shared/cityRevealTypes';
import type { CityRevealCity, CityRevealTodayResponse } from '@shared/cityRevealTypes';
import { CityInput } from '../components/CityInput/CityInput';
import { useGameState } from '../lib/useGameState';
import { fetchCityRevealToday, guessCityReveal, submitCityRevealResult } from '../lib/api';
import styles from './CityReveal.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const STYLE_URL = `https://api.maptiler.com/maps/streets-v4/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`;
const TERRAIN_DEM_SOURCE = 'maptiler-dem';
const CUSTOM_HILLSHADE_LAYER = 'city-reveal-hillshade';

/** Layer groups revealed cumulatively at each wrong-guess stage (0 = start). */
const ROADS_AND_BELOW: LayerGroupId[] = ['terrain', 'water', 'majorRoads', 'streetGrid', 'railways'];
const STAGE_GROUPS: Record<number, LayerGroupId[]> = {
  0: ['terrain'],
  1: ['terrain', 'water'],
  2: ROADS_AND_BELOW,
  3: ROADS_AND_BELOW, // landmarks shown via markers, not layer groups
  4: [...ROADS_AND_BELOW, 'roadNames'],
};

/** All groups revealed on win (excludes placeLabels which reveals the city name). */
const WIN_GROUPS: LayerGroupId[] = [
  'terrain', 'water', 'majorRoads', 'streetGrid', 'railways',
  'roadNames', 'urbanFabric', 'buildings', 'districtLabels', 'contours',
];

/** Human-readable label for what was just revealed at each stage. */
const STAGE_REVEAL_LABELS: Record<number, string> = {
  1: '💧 Water revealed',
  2: '🛣️ Roads & railways revealed',
  3: '📍 Landmarks revealed',
  4: '🔤 Road names revealed',
};

// ── Local game state ──────────────────────────────────────────────────────────

interface GuessEntry {
  cityId: string;
  cityName: string;
  countryCode: string;
  distanceKm: number;
  bearing: number;
  correct: boolean;
}

interface LocalGameState {
  date: string;
  guesses: GuessEntry[];
  won: boolean;
  gameOver: boolean;
  wonCity?: CityRevealCity;
}

function storageKey(date: string) {
  return `geogames:city-reveal:game:${date}`;
}

function loadState(date: string): LocalGameState | null {
  try {
    const raw = localStorage.getItem(storageKey(date));
    if (raw) { return JSON.parse(raw) as LocalGameState; }
  } catch (e) { console.error('CityReveal: corrupt saved state, resetting', e); }
  return null;
}

function saveState(state: LocalGameState) {
  localStorage.setItem(storageKey(state.date), JSON.stringify(state));
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// ── Wikipedia thumbnail fetch ─────────────────────────────────────────────────

async function fetchWikiThumb(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) { return null; }
    const data = await res.json() as { thumbnail?: { source: string } };
    return data.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

// ── Marker element factory ────────────────────────────────────────────────────

function createPhotoMarkerEl(
  imageUrl: string | null,
  onClick?: () => void,
): HTMLDivElement {
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

// ── Confetti ──────────────────────────────────────────────────────────────────

const CONFETTI_COLOURS = ['#6b7cff', '#ff6b9d', '#ffd166', '#06d6a0', '#ef476f', '#73d2de'];
// Generated once at module load — stable across re-renders
const CONFETTI_PIECES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  delay: `${Math.random() * 1.2}s`,
  colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
  size: `${6 + Math.random() * 8}px`,
  duration: `${2 + Math.random() * 1.5}s`,
}));

function Confetti() {
  const pieces = CONFETTI_PIECES;

  return (
    <div className={styles.confettiContainer} aria-hidden="true">
      {pieces.map((p) => (
        <div
          key={p.id}
          className={styles.confettiPiece}
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            background: p.colour,
            width: p.size,
            height: p.size,
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CityReveal() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapGL | null>(null);
  const layerMapRef = useRef<Partial<Record<LayerGroupId, string[]>>>({});
  const markersRef = useRef<Marker[]>([]);
  // Ref so async thumbnail callbacks can read the current visibility without stale closures
  const showLandmarksRef = useRef(false);

  const [todayData, setTodayData] = useState<CityRevealTodayResponse | null>(null);
  const [todayCity, setTodayCity] = useState<CityRevealCity | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [gameState, setGameState] = useState<LocalGameState | null>(null);
  const [loadingGuess, setLoadingGuess] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedLandmark, setSelectedLandmark] = useState<{ label: string; imageUrl: string } | null>(null);

  // For the home screen "played today" badge
  const { recordResult } = useGameState('city-reveal');

  // ── Derived state ──────────────────────────────────────────────────────────

  const today = utcToday();
  const guesses = gameState?.guesses ?? [];
  const wrongGuesses = guesses.filter((g) => !g.correct);
  const stage = Math.min(wrongGuesses.length, 4);
  const won = gameState?.won ?? false;
  const gameOver = (gameState?.gameOver ?? false) && !won;
  const finished = won || gameOver;
  const guessedIds = useMemo(() => new Set(guesses.map((g) => g.cityId)), [guesses]);

  // ── Fetch today's city ─────────────────────────────────────────────────────

  useEffect(() => {
    fetchCityRevealToday()
      .then((data) => {
        setTodayData(data);
        const city = CITY_REVEAL_CITIES.find((c) => c.id === data.cityId) ?? null;
        setTodayCity(city);

        const saved = loadState(data.date);
        setGameState(
          saved ?? { date: data.date, guesses: [], won: false, gameOver: false },
        );
      })
      .catch((err: Error) => { setFetchError(err.message); });
  }, []);

  // ── Map initialisation ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainerRef.current || !todayData || mapRef.current) { return; }

    const map = new MapGL({
      container: mapContainerRef.current,
      style: STYLE_URL,
      center: [todayData.lon, todayData.lat],
      zoom: todayData.zoom,
      interactive: false, // disables all mouse/touch interaction
    });

    // Disable all interaction handlers explicitly for belt-and-braces
    map.scrollZoom.disable();
    map.dragPan.disable();
    map.dragRotate.disable();
    map.keyboard.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();

    map.on('load', () => {
      const grouped: Partial<Record<LayerGroupId, string[]>> = {};
      for (const g of LAYER_GROUPS) { grouped[g.id] = []; }

      // Add custom DEM source + hillshade (same pattern as LayerLab)
      map.addSource(TERRAIN_DEM_SOURCE, {
        type: 'raster-dem',
        url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`,
        tileSize: 256,
      });

      // Find first road layer to insert hillshade below it
      const firstRoadLayer = map.getStyle().layers.find((l) =>
        /road|street|motorway|trunk|primary/.test(l.id.toLowerCase()),
      )?.id;

      map.addLayer(
        {
          id: CUSTOM_HILLSHADE_LAYER,
          type: 'hillshade',
          source: TERRAIN_DEM_SOURCE,
          paint: {
            'hillshade-exaggeration': 0.25,
            'hillshade-shadow-color': 'rgba(45,30,15,0.22)',
            'hillshade-highlight-color': 'rgba(255,252,235,0.09)',
          },
        },
        firstRoadLayer,
      );
      grouped['terrain']!.push(CUSTOM_HILLSHADE_LAYER);

      // Classify all style layers into groups
      for (const layer of map.getStyle().layers) {
        const raw = layer as Record<string, unknown>;
        const sourceLayer = raw['source-layer'] as string | undefined;
        const minzoom = raw['minzoom'] as number | undefined;
        const group = classifyLayer(layer.id, layer.type, sourceLayer, minzoom);
        if (group !== null) {
          (grouped[group] ??= []).push(layer.id);
        }
      }

      // Filter out fill-extrusion (3D buildings) and lower min-zoom for 2D buildings
      if (grouped['buildings']) {
        grouped['buildings'] = grouped['buildings'].filter((id) => {
          const l = map.getLayer(id);
          return l?.type !== 'fill-extrusion';
        });
        for (const id of grouped['buildings']) {
          map.setLayerZoomRange(id, 13, 24);
        }
      }

      layerMapRef.current = grouped;

      // Set initial visibility: only terrain visible; hide all other groups including
      // labels/placeLabels which are never revealed (they'd expose the city name).
      const initialVisible = new Set<string>(STAGE_GROUPS[0]);
      for (const group of LAYER_GROUPS) {
        const visibility = initialVisible.has(group.id) ? 'visible' : 'none';
        for (const id of grouped[group.id] ?? []) {
          try { map.setLayoutProperty(id, 'visibility', visibility); } catch { /* layer may not support */ }
        }
      }

      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayData]);

  // ── Update layer visibility when stage changes ─────────────────────────────

  useEffect(() => {
    if (!mapReady || !mapRef.current) { return; }
    const map = mapRef.current;
    const visibleGroups = won
      ? new Set<string>(WIN_GROUPS)
      : new Set<string>(STAGE_GROUPS[stage]);

    for (const group of LAYER_GROUPS) {
      if (group.id === 'terrain3d') { continue; }
      const visibility = visibleGroups.has(group.id) ? 'visible' : 'none';
      for (const id of layerMapRef.current[group.id] ?? []) {
        try { map.setLayoutProperty(id, 'visibility', visibility); } catch { /* ignore */ }
      }
    }
  }, [stage, won, mapReady]);

  // ── Landmark markers ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !mapRef.current || !todayCity) { return; }
    const map = mapRef.current;

    // Clear any existing markers
    markersRef.current.forEach((m) => { m.remove(); });
    markersRef.current = [];

    // Create markers (hidden initially) and fetch images
    for (const lm of todayCity.landmarks) {
      const el = createPhotoMarkerEl(null);
      const marker = new Marker({ element: el, anchor: 'center' })
        .setLngLat([lm.lon, lm.lat]);

      markersRef.current.push(marker);

      // Fetch thumbnail asynchronously and update marker
      fetchWikiThumb(lm.wikiTitle).then((url) => {
        if (!url) { return; }
        const updatedEl = createPhotoMarkerEl(url, () => {
          setSelectedLandmark({ label: lm.label, imageUrl: url });
        });
        // Replace marker with updated element
        marker.remove();
        const updatedMarker = new Marker({ element: updatedEl, anchor: 'center' })
          .setLngLat([lm.lon, lm.lat]);
        // Track index to replace in ref
        const idx = markersRef.current.indexOf(marker);
        if (idx !== -1) {
          markersRef.current[idx] = updatedMarker;
          // Use refs to avoid stale closures: showLandmarksRef for stage, mapRef for map lifetime
          if (showLandmarksRef.current && mapRef.current) { updatedMarker.addTo(mapRef.current); }
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, todayCity]);

  // ── Show/hide landmark markers when stage crosses threshold ───────────────

  useEffect(() => {
    if (!mapReady || !mapRef.current) { return; }
    const map = mapRef.current;
    const showLandmarks = stage >= 3 || won;
    showLandmarksRef.current = showLandmarks;
    for (const marker of markersRef.current) {
      if (showLandmarks) {
        marker.addTo(map);
      } else {
        marker.remove();
      }
    }
  }, [stage, won, mapReady]);

  // ── Close landmark modal on Escape ────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSelectedLandmark(null); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, []);

  // ── Guess handler ──────────────────────────────────────────────────────────

  const handleGuess = useCallback(
    async (city: CityRevealCity) => {
      if (loadingGuess || finished || !gameState) { return; }
      setLoadingGuess(true);

      try {
        const data = await guessCityReveal(city.id);

        const entry: GuessEntry = {
          cityId: city.id,
          cityName: city.name,
          countryCode: city.countryCode,
          distanceKm: data.distanceKm ?? 0,
          bearing: data.bearing ?? 0,
          correct: data.correct,
        };

        const newGuesses = [...gameState.guesses, entry];
        const newWon = data.correct;
        const newWrongCount = newGuesses.filter((g) => !g.correct).length;
        const newGameOver = !newWon && newWrongCount >= MAX_GUESSES;

        const newState: LocalGameState = {
          date: gameState.date,
          guesses: newGuesses,
          won: newWon,
          gameOver: newGameOver,
          wonCity: data.correct ? data.city : undefined,
        };
        setGameState(newState);
        saveState(newState);

        if (newWon || newGameOver) {
          recordResult(newWon, newGuesses.length);
          submitCityRevealResult(newWon, newGuesses.length).catch(console.error);
        }
      } catch (err) {
        console.error('Guess failed:', err);
      } finally {
        setLoadingGuess(false);
      }
    },
    [loadingGuess, finished, gameState, recordResult],
  );

  // ── Stage indicator data ───────────────────────────────────────────────────

  const stageSteps = [
    { label: 'Terrain', icon: '⛰️' },
    { label: 'Water', icon: '💧' },
    { label: 'Roads', icon: '🛣️' },
    { label: 'Landmarks', icon: '📍' },
    { label: 'Road Names', icon: '🔤' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (fetchError) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <p>Failed to load today's puzzle: {fetchError}</p>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>Loading today's city…</div>
      </div>
    );
  }

  const revealedCity = gameState.wonCity ?? (gameOver ? todayCity : null);

  return (
    <div className={styles.page}>
      {/* ── Map ── */}
      <div className={styles.mapSection}>
        <div
          ref={mapContainerRef}
          className={styles.map}
          style={{ opacity: mapReady ? 1 : 0 }}
          data-testid="city-reveal-map"
        />

        {/* Stage progress overlay */}
        <div className={styles.stageOverlay} aria-label="Revealed layers">
          {stageSteps.map((step, i) => (
            <div
              key={step.label}
              className={`${styles.stageStep} ${(won || i <= stage) ? styles.stageStepActive : ''}`}
              title={step.label}
            >
              <span>{step.icon}</span>
              <span className={styles.stageLabel}>{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Game UI ── */}
      <div className={styles.gamePanel}>
        <header className={styles.header}>
          <h1 className={styles.title}>City Reveal</h1>
          <p className={styles.date}>{today}</p>
        </header>

        {/* Guess counter */}
        <div className={styles.guessCounter}>
          {finished
            ? won
              ? `🎉 Got it in ${guesses.length} guess${guesses.length !== 1 ? 'es' : ''}!`
              : '❌ Better luck tomorrow'
            : `Guess ${guesses.length + 1} of ${MAX_GUESSES}`}
        </div>

        {/* Show what was just revealed */}
        {!finished && stage > 0 && (
          <div className={styles.revealBanner}>
            {STAGE_REVEAL_LABELS[stage]}
          </div>
        )}

        {/* Input */}
        {!finished && (
          <div className={styles.inputSection}>
            <CityInput
              cities={CITY_REVEAL_CITIES}
              guessedIds={guessedIds}
              onGuess={handleGuess}
              disabled={finished}
              loading={loadingGuess}
            />
          </div>
        )}

        {/* Guess history */}
        {guesses.length > 0 && (
          <ol className={styles.guessList} aria-label="Guess history">
            {[...guesses].reverse().map((g, i) => (
              <li
                key={`${g.cityId}-${i}`}
                className={`${styles.guessRow} ${g.correct ? styles.guessCorrect : styles.guessWrong}`}
              >
                <span className={styles.guessFlag}>{flagEmoji(g.countryCode)}</span>
                <span className={styles.guessCity}>{g.cityName}</span>
                {!g.correct && (
                  <>
                    <span className={styles.guessDistance}>
                      {g.distanceKm.toLocaleString()} km
                    </span>
                    <span className={styles.guessArrow} aria-label={`Direction: bearing ${g.bearing}`}>
                      {bearingToArrow(g.bearing)}
                    </span>
                  </>
                )}
                {g.correct && (
                  <span className={styles.guessCorrectBadge}>✓</span>
                )}
              </li>
            ))}
          </ol>
        )}

        {/* Win / game-over reveal */}
        {revealedCity && (
          <div className={`${styles.resultCard} ${won ? styles.resultCardWin : styles.resultCardLoss}`}>
            <span className={styles.resultFlag}>{flagEmoji(revealedCity.countryCode)}</span>
            <div className={styles.resultCity}>
              <strong>{revealedCity.name}</strong>
              <span>{revealedCity.country}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Celebration confetti ── */}
      {won && <Confetti />}

      {/* ── Landmark modal ── */}
      {selectedLandmark && (
        <div
          className={styles.modalOverlay}
          onClick={() => { setSelectedLandmark(null); }}
          role="dialog"
          aria-modal="true"
          aria-label={selectedLandmark.label}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <img
              src={selectedLandmark.imageUrl}
              alt={selectedLandmark.label}
              className={styles.modalImg}
            />
            <p className={styles.modalLabel}>{selectedLandmark.label}</p>
            <button
              className={styles.modalClose}
              onClick={() => { setSelectedLandmark(null); }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
