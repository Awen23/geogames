import { useState } from 'react';
import type { GuessResult, Tier } from '@shared/types';
import styles from './ShareCard.module.css';

const TIER_EMOJI: Record<Tier, string> = {
  found: '🟩',
  warm: '🟨',
  cold: '⬛',
};

interface ShareCardProps {
  gameTitle: string;
  date: string;
  guesses: GuessResult[];
  maxGuesses: number;
  foundCount: number;
  /** Score as a percentage (0–100, 1 decimal place) */
  scorePct: number;
}

export function ShareCard({ gameTitle, date, guesses, maxGuesses, foundCount, scorePct }: ShareCardProps) {
  const [copied, setCopied] = useState(false);

  const grid = guesses.map((g) => TIER_EMOJI[g.tier]).join('');
  const padding = '⬜'.repeat(maxGuesses - guesses.length);
  const emojiGrid = grid + padding;

  const scoreStr = `${foundCount}/5 found · ${scorePct}% · ${guesses.length}/${maxGuesses} guesses`;
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
