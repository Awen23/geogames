import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { TodayResponse, GuessResult, Tier, WhereMostStatsResponse } from '@shared/types';
import { CountryInput } from '../components/CountryInput/CountryInput';
import { DailyHeader } from '../components/DailyHeader/DailyHeader';
import { ShareCard } from '../components/ShareCard/ShareCard';
import { fetchToday, fetchTodayStats, gradeGuess, submitWhereMostResult } from '../lib/api';
import { isGuessEntry, useGameState } from '../lib/useGameState';
import { countSlotGuesses } from '../lib/mostleGuessCounter';
import { isArrayOf, isNumber, isRecord, isString, pruneKeys, readJson, removeKey, writeJson } from '../lib/storage';
import { displayName } from '@shared/guessCountries';
import { MAX_GUESSES, TOP_N, coveragePercent, rawScore, scorePercent } from '@shared/whereMostScore';
import { TopAnswersSection } from './WhereMostTopAnswers';
import styles from './WhereMost.module.css';

const GAME_ID = 'where-most';
/** Safety cap: no-data guesses do not consume the five slots, so bound total picks to avoid endless play / API abuse. */
const MAX_TOTAL_SELECTIONS = 20;
// In-progress game, one key per puzzle date; only today's is kept. A finished game lives under
// useGameState's own key (geogames:where-most:state), which this prefix doesn't match.
const PROGRESS_KEY_PREFIX = 'geogames:where-most:progress:';

interface Guess {
  iso3: string;
  result: GuessResult;
}

interface RankedGuess extends Guess {
  result: GuessResult & {
    rank: number;
    value: number;
    tier: Exclude<Tier, 'no-data'>;
  };
}

const TIER_BADGE: Record<Exclude<Tier, 'no-data'>, string> = {
  found: '🟩',
  warm: '🟨',
  cold: '⬛',
};

function isRankedGuess(guess: Guess): guess is RankedGuess {
  return guess.result.tier !== 'no-data' && guess.result.rank !== null && guess.result.value !== null;
}

/** Whether the game is over: all top-N found, every slot used, or the total-picks cap reached. */
function isFinished(guesses: readonly Guess[], totalGradedRounds: number): boolean {
  return guesses.filter((g) => g.result.isTopFive).length >= TOP_N
    || countSlotGuesses(guesses) >= MAX_GUESSES
    || totalGradedRounds >= MAX_TOTAL_SELECTIONS;
}

/** Everything needed to restore a game in progress: the graded picks, exactly as the page holds them. */
interface SavedProgress {
  date: string;
  /** Which question this belongs to, so progress on another question is never restored. */
  questionId: string;
  /** Slot-using picks only (no-data picks are in noDataIso3s); a `cold` one may have no rank. */
  guesses: Guess[];
  noDataIso3s: string[];
  totalGradedRounds: number;
}

function progressKey(date: string) {
  return `${PROGRESS_KEY_PREFIX}${date}`;
}

/** Saved guesses use a slot, so a no-data one there is invalid. */
function isSavedGuess(v: unknown): v is Guess {
  return isGuessEntry(v) && v.result.tier !== 'no-data';
}

function isSavedProgress(v: unknown): v is SavedProgress {
  return isRecord(v) && isString(v.date) && isString(v.questionId)
    && isArrayOf(v.guesses, isSavedGuess) && isArrayOf(v.noDataIso3s, isString)
    && isNumber(v.totalGradedRounds) && Number.isInteger(v.totalGradedRounds) && v.totalGradedRounds >= 0;
}

/** Today's saved game in progress, or null if there is none, it is for another puzzle, or it had already ended. */
function loadProgress(today: TodayResponse): SavedProgress | null {
  const saved = readJson<SavedProgress | null>(progressKey(today.date), isSavedProgress, null);
  if (saved === null || saved.date !== today.date || saved.questionId !== today.id) { return null; }
  // A finished game is recorded by useGameState, never restored from here.
  return isFinished(saved.guesses, saved.totalGradedRounds) ? null : saved;
}

function GuessRow({ guess, unit }: { guess: RankedGuess; unit: string }) {
  const { iso3, result } = guess;

  return (
    <li className={`${styles.guessItem} ${styles[`tier-${result.tier}`]}`}>
      <span className={styles.guessBadge}>{TIER_BADGE[result.tier]}</span>
      <span className={styles.guessName}>{displayName(iso3)}</span>
      <span className={styles.guessStats}>
        <span className={styles.guessRank}>#{result.rank} · {result.value.toFixed(2)} {unit}</span>
      </span>
    </li>
  );
}

function ProgressBar({
  coveredTotal,
  topNTotal,
  unit,
  topN,
}: {
  coveredTotal: number;
  topNTotal: number;
  unit: string;
  topN: number;
}) {
  const percentCovered = coveragePercent(coveredTotal, topNTotal);
  const percentCoveredOneDecimal = Math.round(percentCovered * 10) / 10;
  return (
    <div className={styles.progressSection}>
      <div
        className={styles.progressBar}
        role="progressbar"
        aria-valuenow={percentCoveredOneDecimal}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Your coverage of the top-${topN} total`}
      >
        <div className={styles.progressFill} style={{ width: `${percentCovered}%` }} />
      </div>
      <p className={styles.progressLabel}>
        Coverage: {percentCoveredOneDecimal}% of the top-{topN} total
        <span className={styles.progressDetail}>
          {coveredTotal.toFixed(1)} / {topNTotal.toFixed(1)} {unit}
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
  const [isMapExpanded, setMapExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const expandMapButtonRef = useRef<HTMLButtonElement>(null);
  const gradingInFlightRef = useRef(false);
  const closeMapButtonRef = useRef<HTMLButtonElement>(null);
  const mapDialogRef = useRef<HTMLDivElement>(null);

  const { todayResult, streak, longestStreak, recordResult, resetForDev } = useGameState(GAME_ID);

  const displayGuesses = guesses.length > 0 ? guesses : replayGuesses;
  const rankedDisplayGuesses = displayGuesses.filter(isRankedGuess);
  const displaySlotCount = countSlotGuesses(displayGuesses);
  const displayFoundFromGuesses = displayGuesses.filter((g) => g.result.isTopFive).length;
  const isGameOver = isFinished(guesses, totalGradedRounds);
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

  useEffect(() => {
    if (!isMapExpanded) {
      return;
    }

    closeMapButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMapExpanded(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = Array.from(
        mapDialogRef.current?.querySelectorAll<HTMLElement>(
          'button, iframe, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute('disabled'));

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!mapDialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      expandMapButtonRef.current?.focus();
    };
  }, [isMapExpanded]);

  const raw = rawScore(displayGuesses.map((g) => g.result));
  const topNTotal = today?.maxScore ?? 0;

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

  // Restore a game in progress once today's puzzle is known (before paint, so a fresh game
  // never flashes). Restoring only sets local state: it never regrades or submits.
  useLayoutEffect(() => {
    if (!today) {
      return;
    }
    pruneKeys(PROGRESS_KEY_PREFIX, [progressKey(today.date)]);
    if (todayResult) {
      removeKey(progressKey(today.date));
      return;
    }
    const saved = loadProgress(today);
    if (saved) {
      setGuesses(saved.guesses);
      setNoDataExcludedIso3s(saved.noDataIso3s);
      setTotalGradedRounds(saved.totalGradedRounds);
    }
  }, [today, todayResult]);

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
    (finalGuesses: Guess[]) => {
      const slotGuesses = finalGuesses.filter((g) => g.result.tier !== 'no-data');
      const guessCount = slotGuesses.length;
      const allGuesses = finalGuesses.map((g) => ({ iso3: g.iso3, result: g.result }));
      const exactMatches = slotGuesses.filter((g) => g.result.isTopFive).length;
      const guessCountries = slotGuesses.map((g) => g.iso3);
      const guessResults = slotGuesses.map((g) => g.result);
      const score = scorePercent(rawScore(guessResults), topNTotal);
      // Record locally before submitting, so a failed submit can't lose the finished game.
      // won=true always for score-only game (means "played")
      recordResult(true, guessCount, score, {
        exactMatches,
        guessCountries,
        guessResults,
        allGuesses,
      });
      // Fire and forget, like the other games: a failed submit is logged, not retried.
      submitWhereMostResult(score, guessCount, exactMatches, guessCountries).catch((err: Error) =>
        console.error('Failed to submit result:', err),
      );
    },
    [recordResult, topNTotal],
  );

  const handleCountrySelect = useCallback(
    async (iso3: string) => {
      if (isGameOver || gradingInFlightRef.current || !today) {
        return;
      }
      if (excludedIso3s.includes(iso3)) {
        return;
      }

      gradingInFlightRef.current = true;
      try {
        const result = await gradeGuess(iso3);
        const nextTotalRounds = totalGradedRounds + 1;
        setTotalGradedRounds(nextTotalRounds);

        let nextGuesses: Guess[] = guesses;
        let nextNoDataIso3s = noDataExcludedIso3s;
        if (result.tier === 'no-data') {
          setNoDataNoticeIso3(iso3);
          if (!nextNoDataIso3s.includes(iso3)) {
            nextNoDataIso3s = [...nextNoDataIso3s, iso3];
            setNoDataExcludedIso3s(nextNoDataIso3s);
          }
        } else {
          nextGuesses = [...guesses, { iso3, result }];
          setGuesses(nextGuesses);
        }

        if (isFinished(nextGuesses, nextTotalRounds)) {
          handleEndGame(nextGuesses);
          // The recorded result drives the end screen from now on.
          removeKey(progressKey(today.date));
        } else {
          const progress: SavedProgress = {
            date: today.date,
            questionId: today.id,
            guesses: nextGuesses,
            noDataIso3s: nextNoDataIso3s,
            totalGradedRounds: nextTotalRounds,
          };
          writeJson(progressKey(today.date), progress);
        }
      } catch (err) {
        console.error('Failed to grade guess:', err);
      } finally {
        gradingInFlightRef.current = false;
      }
    },
    [guesses, noDataExcludedIso3s, excludedIso3s, isGameOver, today, handleEndGame, totalGradedRounds],
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
  const displayScore = todayResult?.score ?? scorePercent(raw, topNTotal);
  const displayFoundCount = todayResult?.exactMatches ?? (displayGuesses.length > 0 ? displayFoundFromGuesses : null);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Geogames</Link>
        {!import.meta.env.PROD && (
          <button
            className={styles.devResetBtn}
            onClick={() => {
              resetForDev();
              removeKey(progressKey(today.date));
              setGuesses([]);
              setReplayGuesses([]);
              setNoDataExcludedIso3s([]);
              setTotalGradedRounds(0);
              setNoDataNoticeIso3(null);
              setTodayStats(null);
              setStatsLoadState('idle');
            }}
            title="Dev only — reset today"
            aria-label="Reset today's Mostle play on this device"
          >
            ↺ reset
          </button>
        )}
      </div>

      <div className={styles.questionHeader}>
        <span className={styles.questionIcon} data-testid="question-icon">{today.icon}</span>
        <DailyHeader
          today={today}
          guessesUsed={displaySlotCount}
          maxGuesses={MAX_GUESSES}
          showGuessCounter={!showEndScreen}
        />
        <p className={styles.questionDescription}>{today.description}</p>
      </div>

      {/* Progress bar — only shown when there are actual guesses this session */}
      {displayGuesses.length > 0 && (
        <ProgressBar coveredTotal={raw} topNTotal={topNTotal} unit={today.unit} topN={TOP_N} />
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
      {rankedDisplayGuesses.length > 0 && (
        <ul className={styles.guessList} data-testid="guess-list">
          {rankedDisplayGuesses.map((g, i) => (
            <GuessRow key={i} guess={g} unit={today.unit} />
          ))}
        </ul>
      )}

      {/* Country input — only during active game */}
      {!showEndScreen && (
        <CountryInput
          onSelect={handleCountrySelect}
          excludeIso3s={excludedIso3s}
          disabled={isGameOver}
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

          {rankedDisplayGuesses.length > 0 && (
            <ShareCard
              gameTitle="Mostle"
              date={today.date}
              guesses={rankedDisplayGuesses.map((g) => g.result)}
              maxGuesses={MAX_GUESSES}
              foundCount={displayFoundFromGuesses}
              topCount={TOP_N}
              scorePercent={displayScore}
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
            <div className={styles.mapFrame}>
              <button
                ref={expandMapButtonRef}
                type="button"
                className={styles.expandMapButton}
                onClick={() => {
                  setMapExpanded(true);
                }}
                aria-label="Expand map"
                title="Expand map"
              >
                <svg className={styles.expandMapIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 3H3v5M3 3l7 7M16 21h5v-5M21 21l-7-7" />
                </svg>
              </button>
              {!isMapExpanded && (
                <iframe
                  className={styles.mapEmbed}
                  src={today.mapEmbedUrl}
                  title={`${today.metric} choropleth map`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              )}
            </div>
          </div>

          <div className={styles.streakRow}>
            <span className={styles.streak}>🔥 {streak} day streak</span>
            <span className={styles.streakSub}>Best: {longestStreak}</span>
          </div>

          <Link to="/" className={styles.hubLink}>More games →</Link>
        </div>
      )}

      {isMapExpanded && (
        <div
          className={styles.mapOverlay}
          role="presentation"
          onClick={() => {
            setMapExpanded(false);
          }}
        >
          <div
            ref={mapDialogRef}
            className={styles.mapDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="expanded-map-title"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className={styles.mapDialogHeader}>
              <div className={styles.mapDialogTitleGroup}>
                <p className={styles.sectionKicker}>Full data</p>
                <h3 id="expanded-map-title" className={styles.sectionTitle}>{today.metric}</h3>
              </div>
              <button
                ref={closeMapButtonRef}
                type="button"
                className={styles.mapDialogClose}
                onClick={() => {
                  setMapExpanded(false);
                }}
                aria-label="Close expanded map"
              >
                Close
              </button>
            </div>
            <iframe
              className={styles.expandedMapEmbed}
              src={today.mapEmbedUrl}
              title={`${today.metric} expanded choropleth map`}
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      )}
    </div>
  );
}
