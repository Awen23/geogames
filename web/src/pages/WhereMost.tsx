import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { TodayResponse, GuessResult, TodayStatsResponse, Tier } from '@shared/types';
import { Globe } from '../components/Globe/Globe';
import { DailyHeader } from '../components/DailyHeader/DailyHeader';
import { ShareCard } from '../components/ShareCard/ShareCard';
import { fetchToday, gradeGuess, submitResult, fetchTodayStats } from '../lib/api';
import { useGameState } from '../lib/useGameState';
import styles from './WhereMost.module.css';

const MAX_GUESSES = 5;
const GAME_ID = 'where-most';

interface Guess {
  iso3: string;
  result: GuessResult;
}

const TIER_LABEL: Record<Tier, string> = {
  bullseye: '🟢 #1 — Correct!',
  top5: '🟡 Top 5',
  top15: '🟠 Top 15',
  cold: '⬛ Outside top 15',
};

export function WhereMost() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [stats, setStats] = useState<TodayStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { todayResult, streak, longestStreak, recordResult, resetForDev } = useGameState(GAME_ID);

  const isWon = guesses.some((g) => g.result.isCorrect);
  const isGameOver = isWon || guesses.length >= MAX_GUESSES;

  const highlight: Record<string, Tier> = {};
  for (const g of guesses) {
    highlight[g.iso3] = g.result.tier;
  }

  const lastWrongGuess = !isWon
    ? [...guesses].reverse().find((g) => !g.result.isCorrect)
    : null;
  const arrow =
    lastWrongGuess && !isWon
      ? { fromIso3: lastWrongGuess.iso3, bearingDeg: lastWrongGuess.result.bearingDeg }
      : undefined;

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
      const won = finalGuesses.some((g) => g.result.isCorrect);
      const guessCount = finalGuesses.length;
      try {
        await submitResult(won, guessCount);
      } catch (err) {
        console.error('Failed to submit result:', err);
      }
      try {
        const s = await fetchTodayStats();
        setStats(s);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
      recordResult(won, guessCount);
    },
    [recordResult],
  );

  const handleCountryClick = useCallback(
    async (iso3: string) => {
      if (isGameOver || submitting || !today) { return; }
      if (guesses.some((g) => g.iso3 === iso3)) { return; }

      setSubmitting(true);
      try {
        const result = await gradeGuess(iso3, guesses.length);
        const nextGuesses: Guess[] = [...guesses, { iso3, result }];
        setGuesses(nextGuesses);
        const nextIsOver = result.isCorrect || nextGuesses.length >= MAX_GUESSES;
        if (nextIsOver) {
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

  // Replay guard — if already played today, load stats and jump to end screen
  useEffect(() => {
    if (todayResult && !isGameOver) {
      fetchTodayStats()
        .then(setStats)
        .catch((err: Error) => console.error('Failed to fetch stats:', err));
    }
  }, [todayResult, isGameOver]);

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

  const showEndScreen = isGameOver || !!todayResult;

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
              setStats(null);
            }}
            title="Dev only — reset today's play"
          >
            ↺ reset
          </button>
        )}
      </div>

      <DailyHeader
        today={today}
        guessesUsed={guesses.length}
        maxGuesses={MAX_GUESSES}
      />

      {!showEndScreen && (
        <Globe
          onCountryClick={handleCountryClick}
          highlight={highlight}
          arrow={arrow}
          disabled={isGameOver || submitting}
        />
      )}

      {guesses.length > 0 && !showEndScreen && (
        <ul className={styles.guessList} data-testid="guess-list">
          {guesses.map((g, i) => (
            <li key={i} className={`${styles.guessItem} ${styles[`tier-${g.result.tier}`]}`}>
              <span className={styles.guessIso3}>{g.iso3}</span>
              <span className={styles.guessLabel}>{TIER_LABEL[g.result.tier]}</span>
              {!g.result.isCorrect && (
                <span className={styles.guessDistance}>
                  {g.result.distanceKm.toLocaleString()} km
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {showEndScreen && (
        <div className={styles.endScreen} data-testid="end-screen">
          <div className={styles.endResult}>
            {(isWon || todayResult?.won) ? (
              <h2 className={styles.endWon}>
                🎉 {guesses.length > 0
                  ? (isWon ? `Found it in ${guesses.length} guess${guesses.length > 1 ? 'es' : ''}!` : 'You already played today!')
                  : 'You already played today!'}
              </h2>
            ) : (
              <h2 className={styles.endLost}>No more guesses — the answer was{' '}
                <strong>{today.metric}</strong> leader.</h2>
            )}
          </div>

          {guesses.length > 0 && (
            <ShareCard
              gameTitle="Where Most"
              date={today.date}
              guesses={guesses.map((g) => g.result)}
              maxGuesses={MAX_GUESSES}
              isWon={isWon}
            />
          )}

          {stats && (
            <div className={styles.statsRow} data-testid="stats">
              <div className={styles.stat}>
                <span className={styles.statValue}>{stats.plays}</span>
                <span className={styles.statLabel}>plays today</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>
                  {Math.round(stats.bullseyeRate * 100)}%
                </span>
                <span className={styles.statLabel}>first-guess rate</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>
                  {stats.avgGuesses > 0 ? stats.avgGuesses.toFixed(1) : '—'}
                </span>
                <span className={styles.statLabel}>avg guesses</span>
              </div>
            </div>
          )}

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
