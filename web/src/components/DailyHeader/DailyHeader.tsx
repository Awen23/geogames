import type { TodayResponse } from '@shared/types';
import styles from './DailyHeader.module.css';

interface DailyHeaderProps {
  today: TodayResponse;
  guessesUsed: number;
  maxGuesses: number;
}

export function DailyHeader({ today, guessesUsed, maxGuesses }: DailyHeaderProps) {
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
        {today.metric} · {today.unit} ·{' '}
        <a href={today.sourceUrl} target="_blank" rel="noopener noreferrer">
          {today.source}
        </a>
      </p>
      <div className={styles.dots} aria-label={`${guessesUsed} of ${maxGuesses} guesses used`}>
        {dots}
      </div>
    </div>
  );
}
