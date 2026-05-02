import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Map as MapGL, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LAYER_GROUPS } from '../components/CityRevealMap/layers';
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
import {
  STYLE_URL,
  STAGE_GROUPS,
  WIN_GROUPS,
  STAGE_REVEAL_LABELS,
  setupMapLayers,
  createPhotoMarkerEl,
} from '../lib/cityRevealMap';
import { fetchFixedCommonsImage, fetchWikiImage } from '../lib/cityRevealImages';
import type { WikiImageAttribution } from '../lib/cityRevealImages';
import styles from './CityReveal.module.css';

const SHARE_URL = 'https://geogames.today';
const SMALL_SCREEN_QUERY = '(max-width: 699px), (max-height: 720px)';
const TINY_SCREEN_QUERY = '(max-width: 430px), (max-height: 620px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

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

interface SelectedLandmark {
  label: string;
  imageUrl: string;
  attribution: WikiImageAttribution;
}

function storageKey(date: string) {
  return `geogames:city-reveal:game:${date}`;
}

function introDismissalStorageKey(date: string) {
  return `geogames:city-reveal:intro-dismissed:${date}`;
}

function loadState(date: string): LocalGameState | null {
  try {
    const raw = localStorage.getItem(storageKey(date));
    if (raw) { return JSON.parse(raw) as LocalGameState; }
  } catch (e) { console.error('CityReveal: corrupt saved state, resetting', e); }
  return null;
}

function isIntroDismissed(date: string) {
  try {
    return localStorage.getItem(introDismissalStorageKey(date)) === 'true';
  } catch (e) {
    console.error('CityReveal: failed to read intro dismissal state', e);
    return false;
  }
}

function saveIntroDismissal(date: string) {
  try {
    localStorage.setItem(introDismissalStorageKey(date), 'true');
  } catch (e) {
    console.error('CityReveal: failed to save intro dismissal state', e);
  }
}

function saveState(state: LocalGameState) {
  localStorage.setItem(storageKey(state.date), JSON.stringify(state));
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function responsiveMapZoom(baseZoom: number) {
  if (window.matchMedia(TINY_SCREEN_QUERY).matches) {
    return Math.max(baseZoom - 1.4, 8);
  }

  if (window.matchMedia(SMALL_SCREEN_QUERY).matches) {
    return Math.max(baseZoom - 1, 8);
  }

  return baseZoom;
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
  const introStartButtonRef = useRef<HTMLButtonElement>(null);

  const [todayData, setTodayData] = useState<CityRevealTodayResponse | null>(null);
  const [todayCity, setTodayCity] = useState<CityRevealCity | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [gameState, setGameState] = useState<LocalGameState | null>(null);
  const [loadingGuess, setLoadingGuess] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedLandmark, setSelectedLandmark] = useState<SelectedLandmark | null>(null);
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );

  // For the home screen "played today" badge
  const { recordResult, resetForDev: resetGameStateBadge } = useGameState('city-reveal');

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
        const nextState = saved ?? { date: data.date, guesses: [], won: false, gameOver: false };
        setGameState(nextState);
        setShowIntroModal(!isIntroDismissed(data.date));
      })
      .catch((err: Error) => { setFetchError(err.message); });
  }, []);

  useEffect(() => {
    if (showIntroModal) {
      introStartButtonRef.current?.focus();
    }
  }, [showIntroModal]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);

    function syncReducedMotionPreference() {
      setPrefersReducedMotion(mediaQuery.matches);
    }

    mediaQuery.addEventListener('change', syncReducedMotionPreference);
    return () => {
      mediaQuery.removeEventListener('change', syncReducedMotionPreference);
    };
  }, []);

  // ── Map initialisation ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainerRef.current || !todayData || mapRef.current) { return; }

    const map = new MapGL({
      container: mapContainerRef.current,
      style: STYLE_URL,
      center: [todayData.lon, todayData.lat],
      zoom: responsiveMapZoom(todayData.zoom),
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
      layerMapRef.current = setupMapLayers(map);
      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [todayData]);

  // ── Keep the locked map framed for the available viewport ──────────────────

  useEffect(() => {
    if (!mapReady || !mapRef.current || !todayData) { return; }
    const currentTodayData = todayData;

    function syncResponsiveViewport() {
      const map = mapRef.current;
      if (!map) { return; }
      map.resize();
      map.easeTo({ zoom: responsiveMapZoom(currentTodayData.zoom), duration: 250 });
    }

    window.addEventListener('resize', syncResponsiveViewport);
    return () => { window.removeEventListener('resize', syncResponsiveViewport); };
  }, [mapReady, todayData]);

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

    // Clear any existing markers
    markersRef.current.forEach((m) => { m.remove(); });
    markersRef.current = [];

    // Create markers (hidden initially) and fetch images
    for (const lm of todayCity.landmarks) {
      const el = createPhotoMarkerEl(null);
      const marker = new Marker({ element: el, anchor: 'center' })
        .setLngLat([lm.lon, lm.lat]);

      markersRef.current.push(marker);

      // Fetch thumbnail asynchronously and update marker (optional fixed Commons/Wikipedia image URL)
      const imagePromise = lm.thumbnailUrl ? fetchFixedCommonsImage(lm.thumbnailUrl) : fetchWikiImage(lm.wikiTitle);
      imagePromise.then((image) => {
        if (!image) { return; }
        const updatedEl = createPhotoMarkerEl(image.imageUrl, () => {
          setSelectedLandmark({ label: lm.label, imageUrl: image.imageUrl, attribution: image.attribution });
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
      }).catch((err: Error) => {
        console.warn(`CityReveal: failed to load landmark image for "${lm.wikiTitle}"`, err);
      });
    }
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

  // ── Dev reset ─────────────────────────────────────────────────────────────

  const resetForDev = useCallback(() => {
    if (!gameState) {
      return;
    }
    localStorage.removeItem(storageKey(gameState.date));
    localStorage.removeItem(introDismissalStorageKey(gameState.date));
    resetGameStateBadge();
    setGameState({ date: gameState.date, guesses: [], won: false, gameOver: false });
    setShowIntroModal(true);
  }, [gameState, resetGameStateBadge]);

  const handleStartMaple = useCallback(() => {
    if (gameState) {
      saveIntroDismissal(gameState.date);
    }
    setShowIntroModal(false);
  }, [gameState]);

  function handleIntroKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      introStartButtonRef.current?.focus();
    } else if (e.key === 'Escape') {
      handleStartMaple();
    }
  }

  const handleCopyShare = useCallback(() => {
    if (!gameState || !finished) { return; }
    const date = gameState.date;
    const emojiRow = guesses.map((g) => (g.correct ? '🟩' : '⬛')).join('');
    const summaryLine = won
      ? `Solved in ${guesses.length} guess${guesses.length !== 1 ? 'es' : ''}`
      : `Did not solve · ${MAX_GUESSES} guesses`;
    const text = ['Maple', date, summaryLine, '', emojiRow, '', SHARE_URL].join('\n');
    void navigator.clipboard.writeText(text).then(
      () => {
        setShareCopied(true);
        setTimeout(() => { setShareCopied(false); }, 2000);
      },
      (err: Error) => {
        console.error('Clipboard write failed:', err);
      },
    );
  }, [finished, gameState, guesses, won]);

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

        {/* Mobile map controls / desktop stage progress overlay */}
        <div className={styles.mapTopBar}>
          <Link to="/" className={`${styles.backLink} ${styles.mapBackLink}`}>← Games</Link>
          <div className={styles.mapStatus}>
            <div className={styles.mobileMapTitle}>Maple</div>
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
          {!import.meta.env.PROD ? (
            <button
              className={`${styles.devResetBtn} ${styles.mapDevResetBtn}`}
              onClick={resetForDev}
              title="Dev only — reset today"
              aria-label="Reset today's Maple play on this device"
            >
              reset
            </button>
          ) : (
            <span className={styles.mapTopSpacer} aria-hidden="true" />
          )}
        </div>
      </div>

      {/* ── Game UI ── */}
      <div className={styles.gamePanel}>
        <div className={styles.topBar}>
          <Link to="/" className={styles.backLink}>← Games</Link>
          {!import.meta.env.PROD && (
            <button
              className={styles.devResetBtn}
              onClick={resetForDev}
              title="Dev only — reset today"
              aria-label="Reset today's Maple play on this device"
            >
              dev reset
            </button>
          )}
        </div>

        <header className={styles.header}>
          <h1 className={styles.title}>Maple</h1>
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

        {finished && guesses.length > 0 && (
          <button
            type="button"
            className={styles.shareBtn}
            onClick={handleCopyShare}
          >
            {shareCopied ? '✓ Copied!' : 'Copy result'}
          </button>
        )}
      </div>

      {/* ── Celebration confetti ── */}
      {won && <Confetti />}

      {/* ── Start explainer modal ── */}
      {showIntroModal && (
        <div
          className={styles.introOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="maple-intro-title"
          onKeyDown={handleIntroKeyDown}
          onClick={handleStartMaple}
        >
          <div
            className={styles.introCard}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <p className={styles.introEyebrow}>Daily map puzzle</p>
            <h2 id="maple-intro-title" className={styles.introTitle}>How to play Maple</h2>
            {prefersReducedMotion ? (
              <p className={styles.introDemoFallback}>
                Demo summary: wrong city guesses reveal map detail while distance clues point towards the answer.
              </p>
            ) : (
              <img
                className={styles.introDemo}
                src="/assets/reveal-demo.gif"
                alt="Animated demo showing a Maple city guess revealing more map detail and distance clues."
              />
            )}
            <ul className={styles.introList}>
              <li>Guess the hidden city from the map.</li>
              <li>Each wrong guess reveals another map layer.</li>
              <li>Distances and arrows point from your guess towards the answer.</li>
            </ul>
            <button
              ref={introStartButtonRef}
              type="button"
              className={styles.introStartBtn}
              onClick={handleStartMaple}
            >
              Start playing
            </button>
          </div>
        </div>
      )}

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
            <p className={styles.modalAttribution}>
              Image:{' '}
              {selectedLandmark.attribution.author && (
                <>
                  {selectedLandmark.attribution.author}{' '}
                </>
              )}
              <a href={selectedLandmark.attribution.sourceUrl} target="_blank" rel="noopener noreferrer">
                Source
              </a>
              {selectedLandmark.attribution.licence && (
                <>
                  {' '}·{' '}
                  {selectedLandmark.attribution.licenceUrl ? (
                    <a href={selectedLandmark.attribution.licenceUrl} target="_blank" rel="noopener noreferrer">
                      {selectedLandmark.attribution.licence}
                    </a>
                  ) : (
                    selectedLandmark.attribution.licence
                  )}
                </>
              )}
            </p>
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
