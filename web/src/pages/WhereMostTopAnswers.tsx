import type { RankedCountry } from '@shared/types';
import { displayName } from '@shared/guessCountries';
import styles from './WhereMost.module.css';

interface TopAnswersSectionProps {
  answers: RankedCountry[] | null;
  loadState: 'idle' | 'loading' | 'error';
  unit: string;
}

export function TopAnswersSection({ answers, loadState, unit }: TopAnswersSectionProps) {
  return (
    <section className={styles.answersSection} aria-labelledby="top-answers-heading">
      <div className={styles.sectionIntro}>
        <p className={styles.sectionKicker}>Answers</p>
        <h3 id="top-answers-heading" className={styles.sectionTitle}>Top 5</h3>
      </div>

      {answers !== null ? (
        <ol className={styles.answersList}>
          {answers.map((answer, index) => (
            <li key={answer.iso3} className={styles.answerItem}>
              <span className={styles.answerRank}>#{index + 1}</span>
              <span className={styles.answerName}>{displayName(answer.iso3)}</span>
              <span className={styles.answerValue}>{answer.value.toFixed(2)} {unit}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.answersMessage} role={loadState === 'error' ? 'alert' : 'status'}>
          {loadState === 'error'
            ? 'Could not load the top answers. The full dataset is still available below.'
            : 'Loading the top answers...'}
        </p>
      )}
    </section>
  );
}
