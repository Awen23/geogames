import { useState } from 'react';
import type { GuessResult, Tier } from '@shared/types';
import styles from './ShareCard.module.css';

const TIER_EMOJI: Record<Tier, string> = {
  found: '🟩',
  warm: '🟨',
  cold: '⬛',
  'no-data': '▫️',
};

const SHARE_URL = 'https://geogames.today';

interface ShareCardProps {
  gameTitle: string;
  date: string;
  guesses: GuessResult[];
  maxGuesses: number;
  foundCount: number;
  topCount: number;
  /** Score as a whole percent (0–100) */
  scorePercent: number;
}

export function ShareCard({ gameTitle, date, guesses, maxGuesses, foundCount, topCount, scorePercent }: ShareCardProps) {
  const [copied, setCopied] = useState(false);

  const grid = guesses.map((g) => TIER_EMOJI[g.tier]).join('');
  const padding = '⬜'.repeat(maxGuesses - guesses.length);
  const emojiGrid = grid + padding;

  const scoreStr = `${scorePercent}% score · ${foundCount}/${topCount} exact`;
  const shareText = `${gameTitle} ${date}\n${scoreStr}\n\n${emojiGrid}\n\n${SHARE_URL}`;

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
