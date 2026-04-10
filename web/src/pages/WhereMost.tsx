import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { TodayResponse, GuessResult, TodayStatsResponse, Tier, RankedCountry } from '@shared/types';
import { Globe } from '../components/Globe/Globe';
import { CountryInput } from '../components/CountryInput/CountryInput';
import { DailyHeader } from '../components/DailyHeader/DailyHeader';
import { ShareCard } from '../components/ShareCard/ShareCard';
import { fetchToday, gradeGuess, submitResult, fetchTodayStats } from '../lib/api';
import { useGameState } from '../lib/useGameState';
import { displayName } from '../data/countryNames';
import styles from './WhereMost.module.css';

const MAX_GUESSES = 5;
const GAME_ID = 'where-most';

interface Guess {
  iso3: string;
  result: GuessResult;
}

const TIER_BADGE: Record<Tier, string> = {
  bullseye: '🟢',
  top5: '🟡',
  top15: '🟠',
  cold: '⬛',
};

const BEARING_ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];

function bearingToArrow(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return BEARING_ARROWS[idx];
}

/** Build a heatmap for post-game globe: ISO3 → CSS colour, green (top) → red (bottom). */
function buildHeatmap(ranking: RankedCountry[]): Record<string, string> {
  const map: Record<string, string> = {};
  const last = ranking.length - 1;
  ranking.forEach((r, i) => {
    const t = last > 0 ? 1 - i / last : 1;
    const hue = Math.round(120 * t);
    const lightness = Math.round(30 + 15 * t);
    map[r.iso3] = `hsl(${hue}, 75%, ${lightness}%)`;
  });
  return map;
}

function GuessRow({ guess, unit }: { guess: Guess; unit: string }) {
  const { iso3, result } = guess;
  return (
    <li className={`${styles.guessItem} ${styles[`tier-${result.tier}`]}`}>
      <span className={styles.guessBadge}>{TIER_BADGE[result.tier]}</span>
      <span className={styles.guessName}>{displayName(iso3)}</span>
      <span className={styles.guessStats}>
        {result.rank !== null ? (
          <span className={styles.guessRank}>
            #{result.rank}{result.value != null ? ` · ${result.value.toFixed(1)} ${unit}` : ''}
          </span>
        ) : (
          <span className={styles.guessUnranked}>Not ranked</span>
        )}
        {!result.isCorrect && (
          <span className={styles.guessDirection}>
            {bearingToArrow(result.bearingDeg)} {result.distanceKm.toLocaleString()} km
          </span>
        )}
      </span>
    </li>
  );
}

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
  const showEndScreen = isGameOver || !!todayResult;

  const guessedIso3s = guesses.map((g) => g.iso3);
  const heatmap = stats?.ranking ? buildHeatmap(stats.ranking) : undefined;

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

  const handleCountrySelect = useCallback(
    async (iso3: string) => {
      if (isGameOver || submitting || !today) { return; }
      if (guesses.some((g) => g.iso3 === iso3)) { return; }

      setSubmitting(true);
      try {
        const result = await gradeGuess(iso3, guesses.length);
        const nextGuesses: Guess[] = [...guesses, { iso3, result }];
        setGuesses(nextGuesses);
        if (result.isCorrect || nextGuesses.length >= MAX_GUESSES) {
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

  // Replay guard — already played today; load stats and jump to end screen
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

      {/* Icon + question header */}
      <div className={styles.questionHeader}>
        <span className={styles.questionIcon} data-testid="question-icon">{today.icon}</span>
        <DailyHeader
          today={today}
          guessesUsed={guesses.length}
          maxGuesses={MAX_GUESSES}
        />
      </div>

      {/* Guess list — visible throughout */}
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
            {(isWon || todayResult?.won) ? (
              <h2 className={styles.endWon}>
                🎉{' '}
                {guesses.length > 0
                  ? `Found it in ${guesses.length} guess${guesses.length > 1 ? 'es' : ''}!`
                  : 'You already played today!'}
              </h2>
            ) : (
              <h2 className={styles.endLost}>
                No more guesses — the answer was the <strong>{today.metric}</strong> leader.
              </h2>
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

          {/* Post-game globe — coloured by ranking value */}
          {heatmap && (
            <div className={styles.heatmapSection}>
              <p className={styles.heatmapLabel}>{today.metric} by country</p>
              <Globe
                onCountryClick={() => {}}
                heatmap={heatmap}
                disabled
              />
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
