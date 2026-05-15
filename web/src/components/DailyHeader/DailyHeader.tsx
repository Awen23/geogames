import type { TodayResponse } from '@shared/types';
import { guessCounterLabel } from '../../lib/mostleGuessCounter';
import styles from './DailyHeader.module.css';

interface DailyHeaderProps {
  today: TodayResponse;
  guessesUsed: number;
  maxGuesses: number;
  showGuessCounter?: boolean;
}

export function DailyHeader({ today, guessesUsed, maxGuesses, showGuessCounter = true }: DailyHeaderProps) {
  const dots = Array.from({ length: maxGuesses }, (_, i) => (
    <span
      key={i}
      className={`${styles.dot} ${i < guessesUsed ? styles.dotUsed : ''}`}
    />
  ));

  return (
    <div className={styles.header}>
      <h1 className={styles.prompt}>{today.prompt}</h1>
      <p className={styles.meta}>
        {today.metric} · {today.year} · {today.unit} ·{' '}
        <a href={today.sourceUrl} target="_blank" rel="noopener noreferrer">
          {today.source}
        </a>
      </p>
      {showGuessCounter && (
        <div
          className={styles.guessCounterRow}
          aria-label={`${guessesUsed} of ${maxGuesses} guesses used`}
        >
          <p className={styles.guessCounter} data-testid="guess-counter" aria-live="polite">
            {guessCounterLabel(guessesUsed, maxGuesses)}
          </p>
          <div className={styles.dots} aria-hidden="true">
            {dots}
          </div>
        </div>
      )}
    </div>
  );
}
