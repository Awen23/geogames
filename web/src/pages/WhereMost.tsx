import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { TodayResponse, GuessResult, Tier } from '@shared/types';
import { CountryInput } from '../components/CountryInput/CountryInput';
import { DailyHeader } from '../components/DailyHeader/DailyHeader';
import { ShareCard } from '../components/ShareCard/ShareCard';
import { fetchToday, gradeGuess, submitWhereMostResult } from '../lib/api';
import { useGameState } from '../lib/useGameState';
import { progressScore } from '../lib/progressScore';
import { displayName } from '../data/countryNames';
import styles from './WhereMost.module.css';

const MAX_GUESSES = 5;
const TOP_N = 5;
const GAME_ID = 'where-most';

interface Guess {
  iso3: string;
  result: GuessResult;
}

const TIER_BADGE: Record<Tier, string> = {
  found: '🟩',
  warm: '🟨',
  cold: '⬛',
};

function GuessRow({ guess, unit }: { guess: Guess; unit: string }) {
  const { iso3, result } = guess;
  return (
    <li className={`${styles.guessItem} ${styles[`tier-${result.tier}`]}`}>
      <span className={styles.guessBadge}>{TIER_BADGE[result.tier]}</span>
      <span className={styles.guessName}>{displayName(iso3)}</span>
      <span className={styles.guessStats}>
        {result.rank !== null ? (
          <span className={styles.guessRank}>
            #{result.rank}{result.value != null ? ` · ${result.value.toFixed(2)} ${unit}` : ''}
          </span>
        ) : (
          <span className={styles.guessUnranked}>Not in dataset</span>
        )}
      </span>
    </li>
  );
}

function ProgressBar({
  score,
  maxScoreVal,
  unit,
}: {
  score: number;
  maxScoreVal: number;
  unit: string;
}) {
  const pct = maxScoreVal > 0 ? Math.min(100, (score / maxScoreVal) * 100) : 0;
  const pctRounded = Math.round(pct * 10) / 10;
  return (
    <div className={styles.progressSection}>
      <div
        className={styles.progressBar}
        role="progressbar"
        aria-valuenow={pctRounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Your score vs top-5 total"
      >
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.progressLabel}>
        {score.toFixed(1)} / {maxScoreVal.toFixed(1)} {unit} — {pctRounded}%
      </p>
    </div>
  );
}

export function WhereMost() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { todayResult, streak, longestStreak, recordResult, resetForDev } = useGameState(GAME_ID);

  const foundCount = guesses.filter((g) => g.result.isTopFive).length;
  const isGameOver = foundCount === TOP_N || guesses.length >= MAX_GUESSES;
  const showEndScreen = isGameOver || !!todayResult;

  const guessedIso3s = guesses.map((g) => g.iso3);
  const scoreVal = progressScore(guesses);
  const maxScoreVal = today?.maxScore ?? 0;

  useEffect(() => {
    fetchToday()
      .then((data) => {
        setToday(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleEndGame = useCallback(
    async (finalGuesses: Guess[]) => {
      const guessCount = finalGuesses.length;
      const rawScore = progressScore(finalGuesses);
      const scorePct = Math.round(Math.min(100, maxScoreVal > 0 ? (rawScore / maxScoreVal) * 100 : 0));
      try {
        await submitWhereMostResult(scorePct, guessCount);
      } catch (err) {
        console.error('Failed to submit result:', err);
      }
      // won=true always for score-only game (means "played")
      recordResult(true, guessCount, scorePct);
    },
    [recordResult, maxScoreVal],
  );

  const handleCountrySelect = useCallback(
    async (iso3: string) => {
      if (isGameOver || submitting || !today) { return; }
      if (guesses.some((g) => g.iso3 === iso3)) { return; }

      setSubmitting(true);
      try {
        const result = await gradeGuess(iso3);
        const nextGuesses: Guess[] = [...guesses, { iso3, result }];
        setGuesses(nextGuesses);

        const nextFoundCount = nextGuesses.filter((g) => g.result.isTopFive).length;
        if (nextFoundCount === TOP_N || nextGuesses.length >= MAX_GUESSES) {
          await handleEndGame(nextGuesses);
        }
      } catch (err) {
        console.error('Failed to grade guess:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [guesses, isGameOver, submitting, today, handleEndGame],
  );

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          <p>Failed to load today's puzzle.</p>
          <p className={styles.errorDetail}>{error}</p>
          <Link to="/" className={styles.backLink}>← Back to hub</Link>
        </div>
      </div>
    );
  }

  if (!today) { return null; }

  // score from localStorage if replaying, otherwise compute from live guesses
  const displayScore = todayResult?.score ?? Math.round(Math.min(100, maxScoreVal > 0 ? (scoreVal / maxScoreVal) * 100 : 0));
  const displayFoundCount = foundCount;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Geogames</Link>
        {import.meta.env.DEV && (
          <button
            className={styles.devResetBtn}
            onClick={() => {
              resetForDev();
              setGuesses([]);
            }}
            title="Dev only — reset today's play"
          >
            ↺ reset
          </button>
        )}
      </div>

      <div className={styles.questionHeader}>
        <span className={styles.questionIcon} data-testid="question-icon">{today.icon}</span>
        <DailyHeader
          today={today}
          guessesUsed={guesses.length}
          maxGuesses={MAX_GUESSES}
        />
        <p className={styles.questionDescription}>{today.description}</p>
      </div>

      {/* Progress bar — only shown when there are actual guesses this session */}
      {guesses.length > 0 && (
        <ProgressBar score={scoreVal} maxScoreVal={maxScoreVal} unit={today.unit} />
      )}

      {/* Guess list */}
      {guesses.length > 0 && (
        <ul className={styles.guessList} data-testid="guess-list">
          {guesses.map((g, i) => (
            <GuessRow key={i} guess={g} unit={today.unit} />
          ))}
        </ul>
      )}

      {/* Country input — only during active game */}
      {!showEndScreen && (
        <CountryInput
          onSelect={handleCountrySelect}
          excludeIso3s={guessedIso3s}
          disabled={isGameOver || submitting}
        />
      )}

      {/* End screen */}
      {showEndScreen && (
        <div className={styles.endScreen} data-testid="end-screen">
          <div className={styles.endResult}>
            <h2 className={styles.endScore}>
              {guesses.length > 0
                ? `${displayFoundCount}/5 found — score: ${displayScore}%`
                : `You played today — score: ${displayScore}%`}
            </h2>
          </div>

          {guesses.length > 0 && (
            <ShareCard
              gameTitle="Mostle"
              date={today.date}
              guesses={guesses.map((g) => g.result)}
              maxGuesses={MAX_GUESSES}
              foundCount={foundCount}
              scorePct={displayScore}
            />
          )}

          {/* Post-game choropleth map from OWID */}
          <div className={styles.mapSection}>
            <p className={styles.mapLabel}>{today.metric} — world map</p>
            <iframe
              className={styles.mapEmbed}
              src={today.mapEmbedUrl}
              title={`${today.metric} choropleth map`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          <div className={styles.streakRow}>
            <span className={styles.streak}>🔥 {streak} day streak</span>
            <span className={styles.streakSub}>Best: {longestStreak}</span>
          </div>

          <Link to="/" className={styles.hubLink}>More games →</Link>
        </div>
      )}
    </div>
  );
}
