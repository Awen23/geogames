import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { TodayResponse, GuessResult, Tier, WhereMostStatsResponse } from '@shared/types';
import { CountryInput } from '../components/CountryInput/CountryInput';
import { DailyHeader } from '../components/DailyHeader/DailyHeader';
import { ShareCard } from '../components/ShareCard/ShareCard';
import { fetchToday, fetchTodayStats, gradeGuess, submitWhereMostResult } from '../lib/api';
import { useGameState } from '../lib/useGameState';
import { progressScore } from '../lib/progressScore';
import { displayName } from '@shared/guessCountries';
import { TopAnswersSection } from './WhereMostTopAnswers';
import styles from './WhereMost.module.css';

const MAX_GUESSES = 5;
const TOP_N = 5;
const GAME_ID = 'where-most';
/** Safety cap: no-data guesses do not consume the five slots, so bound total picks to avoid endless play / API abuse. */
const MAX_TOTAL_SELECTIONS = 20;

interface Guess {
  iso3: string;
  result: GuessResult;
}

const TIER_BADGE: Record<Tier, string> = {
  found: '🟩',
  warm: '🟨',
  cold: '⬛',
  'no-data': '⬜',
};

function GuessRow({ guess, unit }: { guess: Guess; unit: string }) {
  const { iso3, result } = guess;
  const stats =
    result.tier === 'no-data' ? (
      <span className={styles.guessUnranked}>No data for this metric</span>
    ) : result.rank !== null ? (
      <span className={styles.guessRank}>
        #{result.rank}{result.value != null ? ` · ${result.value.toFixed(2)} ${unit}` : ''}
      </span>
    ) : (
      <span className={styles.guessUnranked}>Not in today&apos;s top five</span>
    );

  return (
    <li className={`${styles.guessItem} ${styles[`tier-${result.tier}`]}`}>
      <span className={styles.guessBadge}>{TIER_BADGE[result.tier]}</span>
      <span className={styles.guessName}>{displayName(iso3)}</span>
      <span className={styles.guessStats}>{stats}</span>
    </li>
  );
}

function ProgressBar({
  score,
  maxScoreVal,
  unit,
  topN,
}: {
  score: number;
  maxScoreVal: number;
  unit: string;
  topN: number;
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
        aria-label={`Your coverage of the top-${topN} total`}
      >
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.progressLabel}>
        Coverage: {pctRounded}% of the top-{topN} total
        <span className={styles.progressDetail}>
          {score.toFixed(1)} / {maxScoreVal.toFixed(1)} {unit}
        </span>
      </p>
    </div>
  );
}

export function WhereMost() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [todayStats, setTodayStats] = useState<WhereMostStatsResponse | null>(null);
  const [statsLoadState, setStatsLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [replayGuesses, setReplayGuesses] = useState<Guess[]>([]);
  /** ISO3 picks that returned `no-data` this session — excluded from input but not listed as guesses. */
  const [noDataExcludedIso3s, setNoDataExcludedIso3s] = useState<string[]>([]);
  /** Counts every successful /grade call (including no-data) so MAX_TOTAL_SELECTIONS still applies. */
  const [totalGradedRounds, setTotalGradedRounds] = useState(0);
  const [noDataNoticeIso3, setNoDataNoticeIso3] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { todayResult, streak, longestStreak, recordResult, resetForDev } = useGameState(GAME_ID);

  const liveFoundCount = guesses.filter((g) => g.result.isTopFive).length;
  const slotGuessCount = guesses.filter((g) => g.result.tier !== 'no-data').length;
  const displayGuesses = guesses.length > 0 ? guesses : replayGuesses;
  const displaySlotCount = displayGuesses.filter((g) => g.result.tier !== 'no-data').length;
  const displayFoundFromGuesses = displayGuesses.filter((g) => g.result.isTopFive).length;
  const isGameOver =
    liveFoundCount === TOP_N ||
    slotGuessCount >= MAX_GUESSES ||
    totalGradedRounds >= MAX_TOTAL_SELECTIONS;
  const showEndScreen = isGameOver || !!todayResult;

  const excludedIso3s = useMemo(() => {
    const s = new Set<string>();
    for (const g of guesses) {
      s.add(g.iso3);
    }
    for (const iso of noDataExcludedIso3s) {
      s.add(iso);
    }
    return Array.from(s);
  }, [guesses, noDataExcludedIso3s]);

  useEffect(() => {
    if (noDataNoticeIso3 === null) {
      return;
    }
    const t = window.setTimeout(() => {
      setNoDataNoticeIso3(null);
    }, 4200);
    return () => {
      window.clearTimeout(t);
    };
  }, [noDataNoticeIso3]);
  const scoreVal = progressScore(displayGuesses);
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

  useEffect(() => {
    if (!showEndScreen || todayStats !== null) {
      return;
    }

    let cancelled = false;
    setStatsLoadState('loading');
    fetchTodayStats()
      .then((stats) => {
        if (!cancelled) {
          setTodayStats(stats);
          setStatsLoadState('idle');
        }
      })
      .catch((err: Error) => {
        console.error('Failed to load Where Most stats:', err);
        if (!cancelled) {
          setStatsLoadState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showEndScreen, todayStats]);

  useEffect(() => {
    if (!todayResult || guesses.length > 0) {
      setReplayGuesses([]);
      return;
    }

    if (todayResult.allGuesses && todayResult.allGuesses.length > 0) {
      setReplayGuesses(todayResult.allGuesses);
      return;
    }

    const savedCountries = todayResult.guessCountries ?? [];
    if (savedCountries.length === 0) {
      setReplayGuesses([]);
      return;
    }

    const savedResults = todayResult.guessResults ?? [];
    if (savedResults.length === savedCountries.length) {
      setReplayGuesses(savedCountries.map((iso3, i) => ({ iso3, result: savedResults[i] })));
      return;
    }

    let cancelled = false;
    Promise.all(savedCountries.map((iso3) => gradeGuess(iso3)))
      .then((results) => {
        if (!cancelled) {
          setReplayGuesses(savedCountries.map((iso3, i) => ({ iso3, result: results[i] })));
        }
      })
      .catch((err: Error) => {
        console.error('Failed to load saved guess details:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [todayResult, guesses.length]);

  const handleEndGame = useCallback(
    async (finalGuesses: Guess[]) => {
      const slotGuesses = finalGuesses.filter((g) => g.result.tier !== 'no-data');
      const guessCount = slotGuesses.length;
      const allGuesses = finalGuesses.map((g) => ({ iso3: g.iso3, result: g.result }));

      if (guessCount === 0) {
        try {
          await submitWhereMostResult(0, 0, 0, []);
          recordResult(true, 0, 0, {
            exactMatches: 0,
            guessCountries: [],
            guessResults: [],
            allGuesses,
          });
        } catch (err) {
          console.error('Failed to submit result:', err);
        }
        return;
      }

      const exactMatches = slotGuesses.filter((g) => g.result.isTopFive).length;
      const guessCountries = slotGuesses.map((g) => g.iso3);
      const guessResults = slotGuesses.map((g) => g.result);
      const rawScore = progressScore(slotGuesses);
      const scorePct = Math.round(Math.min(100, maxScoreVal > 0 ? (rawScore / maxScoreVal) * 100 : 0));
      try {
        await submitWhereMostResult(scorePct, guessCount, exactMatches, guessCountries);
        // won=true always for score-only game (means "played")
        recordResult(true, guessCount, scorePct, {
          exactMatches,
          guessCountries,
          guessResults,
          allGuesses,
        });
      } catch (err) {
        console.error('Failed to submit result:', err);
      }
    },
    [recordResult, maxScoreVal],
  );

  const handleCountrySelect = useCallback(
    async (iso3: string) => {
      if (isGameOver || submitting || !today) {
        return;
      }
      if (excludedIso3s.includes(iso3)) {
        return;
      }

      setSubmitting(true);
      try {
        const result = await gradeGuess(iso3);
        const nextTotalRounds = totalGradedRounds + 1;
        setTotalGradedRounds(nextTotalRounds);

        let nextGuesses: Guess[] = guesses;
        if (result.tier === 'no-data') {
          setNoDataNoticeIso3(iso3);
          setNoDataExcludedIso3s((prev) => (prev.includes(iso3) ? prev : [...prev, iso3]));
        } else {
          nextGuesses = [...guesses, { iso3, result }];
          setGuesses(nextGuesses);
        }

        const nextSlotCount = nextGuesses.filter((g) => g.result.tier !== 'no-data').length;
        const nextLiveFoundCount = nextGuesses.filter((g) => g.result.isTopFive).length;
        if (
          nextLiveFoundCount === TOP_N ||
          nextSlotCount >= MAX_GUESSES ||
          nextTotalRounds >= MAX_TOTAL_SELECTIONS
        ) {
          await handleEndGame(nextGuesses);
        }
      } catch (err) {
        console.error('Failed to grade guess:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [guesses, excludedIso3s, isGameOver, submitting, today, handleEndGame, totalGradedRounds],
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

  if (!today) {
    return null;
  }

  // score from localStorage if replaying, otherwise compute from live guesses
  const displayScore = todayResult?.score ?? Math.round(Math.min(100, maxScoreVal > 0 ? (scoreVal / maxScoreVal) * 100 : 0));
  const displayFoundCount = todayResult?.exactMatches ?? (displayGuesses.length > 0 ? displayFoundFromGuesses : null);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Geogames</Link>
        <button
          className={`${styles.devResetBtn} ${import.meta.env.PROD ? styles.hiddenResetBtn : ''}`}
          onClick={() => {
            if (import.meta.env.PROD && !window.confirm("Reset today's Mostle play on this device?")) {
              return;
            }
            resetForDev();
            setGuesses([]);
            setReplayGuesses([]);
            setNoDataExcludedIso3s([]);
            setTotalGradedRounds(0);
            setNoDataNoticeIso3(null);
            setTodayStats(null);
            setStatsLoadState('idle');
          }}
          title={import.meta.env.PROD ? 'Reset your local Mostle play' : 'Dev only — reset today'}
          aria-label="Reset today's Mostle play on this device"
        >
          {import.meta.env.PROD ? 'reset' : '↺ reset'}
        </button>
      </div>

      <div className={styles.questionHeader}>
        <span className={styles.questionIcon} data-testid="question-icon">{today.icon}</span>
        <DailyHeader
          today={today}
          guessesUsed={displaySlotCount}
          maxGuesses={MAX_GUESSES}
        />
        <p className={styles.questionDescription}>{today.description}</p>
      </div>

      {/* Progress bar — only shown when there are actual guesses this session */}
      {displayGuesses.length > 0 && (
        <ProgressBar score={scoreVal} maxScoreVal={maxScoreVal} unit={today.unit} topN={TOP_N} />
      )}

      {noDataNoticeIso3 !== null && (
        <p
          className={styles.noDataNotice}
          role="status"
          aria-live="polite"
          data-testid="no-data-notice"
        >
          No data for {displayName(noDataNoticeIso3)} in this dataset — try another country (does not use a guess).
        </p>
      )}

      {/* Guess list */}
      {displayGuesses.length > 0 && (
        <ul className={styles.guessList} data-testid="guess-list">
          {displayGuesses.map((g, i) => (
            <GuessRow key={i} guess={g} unit={today.unit} />
          ))}
        </ul>
      )}

      {/* Country input — only during active game */}
      {!showEndScreen && (
        <CountryInput
          onSelect={handleCountrySelect}
          excludeIso3s={excludedIso3s}
          disabled={isGameOver || submitting}
        />
      )}

      {/* End screen */}
      {showEndScreen && (
        <div className={styles.endScreen} data-testid="end-screen">
          <div className={styles.endResult}>
            <p className={styles.endLabel}>Score</p>
            <h2 className={styles.endScore}>{displayScore}%</h2>
            <p className={styles.endSummary}>
              {displayFoundCount != null
                ? `You found ${displayFoundCount} of the top ${TOP_N} countries.`
                : 'You played today.'}
            </p>
            <p className={styles.endDetail}>
              Your guesses covered {displayScore}% of the combined top-{TOP_N} value.
            </p>
          </div>

          {displayGuesses.length > 0 && (
            <ShareCard
              gameTitle="Mostle"
              date={today.date}
              guesses={displayGuesses.map((g) => g.result).filter((r) => r.tier !== 'no-data')}
              maxGuesses={MAX_GUESSES}
              foundCount={displayFoundFromGuesses}
              topCount={TOP_N}
              scorePct={displayScore}
            />
          )}

          <TopAnswersSection
            answers={todayStats?.ranking.slice(0, TOP_N) ?? null}
            loadState={statsLoadState}
            unit={today.unit}
          />

          {/* Post-game choropleth map from OWID */}
          <div className={styles.mapSection}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionKicker}>Full data</p>
              <h3 className={styles.sectionTitle}>{today.metric}</h3>
            </div>
            <p className={styles.mapLabel}>Explore the complete OWID world map for this metric.</p>
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
