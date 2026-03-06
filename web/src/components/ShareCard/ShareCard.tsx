import { useState } from 'react';
import type { GuessResult, Tier } from '@shared/types';
import styles from './ShareCard.module.css';

const TIER_EMOJI: Record<Tier, string> = {
  bullseye: '🟢',
  top5: '🟡',
  top15: '🟠',
  cold: '⬛',
};

interface ShareCardProps {
  gameTitle: string;
  date: string;
  guesses: GuessResult[];
  maxGuesses: number;
  isWon: boolean;
}

export function ShareCard({ gameTitle, date, guesses, maxGuesses, isWon }: ShareCardProps) {
  const [copied, setCopied] = useState(false);

  const grid = guesses.map((g) => TIER_EMOJI[g.tier]).join('');
  const padding = '⬜'.repeat(maxGuesses - guesses.length);
  const emojiGrid = grid + padding;

  const scoreStr = isWon ? `${guesses.length}/${maxGuesses}` : `X/${maxGuesses}`;
  const shareText = `${gameTitle} ${date}\n${scoreStr}\n\n${emojiGrid}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.card} data-testid="share-card">
      <div className={styles.grid}>{emojiGrid}</div>
      <p className={styles.score}>{scoreStr}</p>
      <button className={styles.copyBtn} onClick={handleCopy}>
        {copied ? '✓ Copied!' : 'Copy result'}
      </button>
    </div>
  );
}
