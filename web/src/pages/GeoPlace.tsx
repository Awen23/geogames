import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Globe } from '../components/Globe/Globe';
import type { PlacedCountryData } from '../components/Globe/Globe';
import { getTodayPuzzle } from '@shared/geoplacePuzzle';
import { countryName } from '@shared/guessCountries';
import { haversineKm } from '@shared/distance';
import centroids from '@shared/centroids.json';
import { useGameState } from '../lib/useGameState';
import { submitGeoplaceResult } from '../lib/api';
import type { GeoplacePlacement } from '@shared/types';
import styles from './GeoPlace.module.css';
import { useMediaQuery } from '../lib/useMediaQuery';

const CENTROID_MAP = centroids as Record<string, { lat: number; lon: number }>;
const MOBILE_PLACEMENT_QUERY = '(max-width: 699px), (pointer: coarse)';
const GAME_ID = 'geoplace';
const MAX_SCORE_KM = 2500;
const ROUNDS_TOTAL = 3;
const SESSION_KEY = 'geogames:geoplace:session';
const SHARE_URL = 'https://geogames.today';

function scoreFromDistance(distKm: number): number {
  return Math.max(0, Math.round((1 - distKm / MAX_SCORE_KM) * 100));
}

function averageScore(scores: number[]): number {
  if (scores.length === 0) { return 0; }
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

type Phase = 'placing' | 'placed' | 'results';

interface GeoplaceSession {
  date: string;
  roundIndex: number;
  phase: Phase;
  placedCountries: PlacedCountryData[];
  scores: number[];
}

function loadSession(): GeoplaceSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) { return null; }
    const parsed = JSON.parse(raw) as GeoplaceSession;
    if (parsed.date !== utcToday()) { return null; }
    return parsed;
  } catch (err) {
    console.error('Failed to load GeoPlace session:', err);
    return null;
  }
}

function saveSession(session: GeoplaceSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to save GeoPlace session:', err);
  }
}

function ResetButton({ onReset }: { onReset: () => void }) {
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <button
      className={styles.devResetBtn}
      onClick={onReset}
      title="Dev only — reset today"
      aria-label="Reset today's GeoPlace play on this device"
    >
      dev reset
    </button>
  );
}

export function GeoPlace() {
  const puzzle = useMemo(() => getTodayPuzzle(), []);
  const { todayResult, recordResult, resetForDev: resetGameState } = useGameState(GAME_ID);

  const savedSession = useMemo(() => loadSession(), []);

  const [roundIndex, setRoundIndex] = useState(savedSession?.roundIndex ?? 0);
  const [phase, setPhase] = useState<Phase>(savedSession?.phase ?? 'placing');
  const [placedCountries, setPlacedCountries] = useState<PlacedCountryData[]>(
    savedSession?.placedCountries ?? [],
  );
  const [scores, setScores] = useState<number[]>(savedSession?.scores ?? []);
  const [copied, setCopied] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<{ lat: number; lon: number } | null>(null);
  const useConfirmPlacement = useMediaQuery(MOBILE_PLACEMENT_QUERY);

  // Persist session state on every change so navigation restores progress
  useEffect(() => {
    saveSession({ date: utcToday(), roundIndex, phase, placedCountries, scores });
  }, [roundIndex, phase, placedCountries, scores]);

  const currentRound = puzzle.rounds[roundIndex];

  const initialRotation = useMemo((): [number, number] => {
    const c = CENTROID_MAP[puzzle.rounds[0].targetIso3];
    return c ? [-c.lon, -c.lat] : [0, -30];
  }, [puzzle]);

  const handlePlace = useCallback(
    (lat: number, lon: number) => {
      if (phase !== 'placing') { return; }
      const actual = CENTROID_MAP[currentRound.targetIso3];
      if (!actual) { return; }
      const distKm = haversineKm({ lat, lon }, actual);
      const score = scoreFromDistance(distKm);
      const newPlaced: PlacedCountryData = {
        iso3: currentRound.targetIso3,
        lat,
        lon,
        label: `${score}%`,
      };
      setPlacedCountries((prev) => [...prev, newPlaced]);
      setScores((prev) => [...prev, score]);
      setPendingPlace(null);
      setPhase('placed');
    },
    [phase, currentRound],
  );

  const handlePendingPlace = useCallback((lat: number, lon: number) => {
    setPendingPlace({ lat, lon });
  }, []);

  const handleCancelPending = useCallback(() => {
    setPendingPlace(null);
  }, []);

  const handleConfirmPending = useCallback(() => {
    if (!pendingPlace) { return; }
    handlePlace(pendingPlace.lat, pendingPlace.lon);
  }, [pendingPlace, handlePlace]);

  useEffect(() => {
    setPendingPlace(null);
  }, [roundIndex, phase]);

  const handleNext = useCallback(() => {
    setPendingPlace(null);
    if (roundIndex < ROUNDS_TOTAL - 1) {
      setRoundIndex((i) => i + 1);
      setPhase('placing');
    } else {
      setPhase('results');
    }
  }, [roundIndex]);

  const handleSeeResults = useCallback(() => {
    const avg = averageScore(scores);
    // won=true always for score-only game (means "played")
    recordResult(true, 0, avg);
    const placements: GeoplacePlacement[] = placedCountries.map((p, i) => ({
      targetIso3: p.iso3,
      clickLat: p.lat,
      clickLon: p.lon,
      score: scores[i] ?? 0,
    }));
    submitGeoplaceResult(avg, placements).catch((err: Error) =>
      console.error('Failed to submit GeoPlace result:', err),
    );
    setPhase('results');
  }, [scores, placedCountries, recordResult]);

  const resetForDev = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    resetGameState();
    setRoundIndex(0);
    setPhase('placing');
    setPlacedCountries([]);
    setScores([]);
  }, [resetGameState]);

  const handleCopyShare = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    const roundLines = scores.map(
      (s, i) => `Round ${i + 1}: ${s}%`,
    );
    const avg = averageScore(scores);
    const text = [`Placle — ${date}`, ...roundLines, `Average: ${avg}%`, '', SHARE_URL].join('\n');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    navigator.clipboard.writeText(text).catch((err: Error) =>
      console.error('Clipboard write failed:', err),
    );
  }, [scores]);

  // Auto-advance after placement: brief pause so the player can see their score and arrow
  useEffect(() => {
    if (phase !== 'placed') { return; }
    const timer = setTimeout(() => {
      if (roundIndex === ROUNDS_TOTAL - 1) {
        handleSeeResults();
      } else {
        handleNext();
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, [phase, roundIndex, handleNext, handleSeeResults]);

  // Replay guard — already played today (not suppressed when we're actively showing results)
  if (todayResult && phase !== 'results') {
    return (
      <div className={styles.page}>
        <div className={styles.topBar}>
          <Link to="/" className={styles.backLink}>← Games</Link>
        </div>
        <div className={styles.alreadyPlayed}>
          <p className={styles.alreadyPlayedTitle}>Already played today</p>
          <p className={styles.alreadyPlayedScore}>Your score: {todayResult.score ?? 0}%</p>
          <p className={styles.alreadyPlayedSub}>Come back tomorrow for a new puzzle</p>
          <ResetButton onReset={resetForDev} />
        </div>
      </div>
    );
  }

  const revealIso3s = phase === 'results' ? puzzle.rounds.map((r) => r.targetIso3) : undefined;
  const avg = averageScore(scores);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Games</Link>
        <ResetButton onReset={resetForDev} />
      </div>

      {/* Game header */}
      {phase !== 'results' && (
        <div className={styles.header}>
          <span className={styles.roundCounter}>
            Round {roundIndex + 1} of {ROUNDS_TOTAL}
          </span>
          {phase === 'placing' && (
            <p className={styles.prompt}>
              Place <strong>{countryName(currentRound.targetIso3)}</strong> on the globe
            </p>
          )}
          {phase === 'placed' && (
            <p className={styles.prompt}>
              <strong>{countryName(currentRound.targetIso3)}</strong> placed —{' '}
              <span className={styles.scoreBadge}>{scores[scores.length - 1]}%</span>
            </p>
          )}
          <p className={styles.referenceHint}>
            Reference: <span className={styles.referenceName}>{countryName(puzzle.referenceIso3)}</span> is highlighted
          </p>
        </div>
      )}

      {/* Globe */}
      <div className={styles.globeWrapper}>
        <Globe
          onCountryClick={() => { /* placement mode — country clicks disabled */ }}
          referenceIso3={puzzle.referenceIso3}
          ghostIso3={phase === 'placing' ? currentRound.targetIso3 : undefined}
          placementMode={useConfirmPlacement ? 'confirm' : 'immediate'}
          pendingPlace={pendingPlace ?? undefined}
          onPendingPlace={phase === 'placing' && useConfirmPlacement ? handlePendingPlace : undefined}
          onPlace={phase === 'placing' && !useConfirmPlacement ? handlePlace : undefined}
          placedCountries={placedCountries}
          revealIso3s={revealIso3s}
          initialRotation={initialRotation}
          disabled={phase !== 'placing'}
          blankGlobe
        />
      </div>

      {phase === 'placing' && useConfirmPlacement && pendingPlace && (
        <div className={styles.placementActions} data-testid="geoplace-placement-actions">
          <button
            type="button"
            className={styles.placementCancelBtn}
            onClick={handleCancelPending}
            aria-label="Cancel placement"
            data-testid="geoplace-cancel-placement"
          >
            ✕
          </button>
          <button
            type="button"
            className={styles.placementConfirmBtn}
            onClick={handleConfirmPending}
            aria-label="Confirm placement"
            data-testid="geoplace-confirm-placement"
          >
            ✓
          </button>
        </div>
      )}

      {/* Action panel */}
      <div className={styles.actionPanel}>
        {phase === 'placing' && useConfirmPlacement && (
          <p className={styles.instruction}>
            {pendingPlace
              ? 'Drag the outline to adjust, tap elsewhere to move it, then confirm'
              : 'Move the globe, then tap where the country should go'}
          </p>
        )}
        {phase === 'placing' && !useConfirmPlacement && (
          <p className={styles.instruction}>
            Move the globe to find the country, then click to place it
          </p>
        )}

        {phase === 'results' && (
          <div className={styles.results}>
            <h2 className={styles.resultsTitle}>Results</h2>
            <ul className={styles.scoreList}>
              {puzzle.rounds.map((round, i) => (
                <li key={round.targetIso3} className={styles.scoreRow}>
                  <span className={styles.scoreRound}>{countryName(round.targetIso3)}</span>
                  <span
                    className={styles.scoreValue}
                    data-good={scores[i] >= 70}
                    data-ok={scores[i] >= 40 && scores[i] < 70}
                  >
                    {scores[i]}%
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.avgRow}>
              <span className={styles.avgLabel}>Average</span>
              <span className={styles.avgValue}>{avg}%</span>
            </div>
            <p className={styles.revealNote}>Correct positions highlighted in pink</p>
            <button className={styles.shareBtn} onClick={handleCopyShare}>
              {copied ? 'Copied!' : 'Copy Result'}
            </button>
            <Link to="/" className={styles.hubLink}>← Back to games</Link>
          </div>
        )}
      </div>
    </div>
  );
}
