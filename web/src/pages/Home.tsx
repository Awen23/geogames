import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGameState } from '../lib/useGameState';
import { fetchGames } from '../lib/api';
import type { GameInfo } from '@shared/types';
import styles from './Home.module.css';

const GAME_ROUTE: Record<string, string> = {
  'where-most': '/games/where-most',
};

function GameCard({ game }: { game: GameInfo }) {
  const { todayResult } = useGameState(game.id);
  const route = GAME_ROUTE[game.id];
  const played = !!todayResult;

  return (
    <Link
      to={route ?? '/'}
      className={`${styles.card} ${played ? styles.cardPlayed : ''}`}
      aria-label={`${game.title}${played ? ', played today' : ''}`}
    >
      <div className={styles.cardTop}>
        <span className={styles.cardIcon}>🌍</span>
        {played && (
          <span className={styles.playedBadge} aria-hidden="true">
            {todayResult.won ? '✓' : '✗'}
          </span>
        )}
      </div>
      <h2 className={styles.cardTitle}>{game.title}</h2>
      <p className={styles.cardTagline}>{game.tagline}</p>
      {played && (
        <p className={styles.playedHint}>
          {todayResult.won
            ? `Won in ${todayResult.guesses} guess${todayResult.guesses > 1 ? 'es' : ''}`
            : `Played — come back tomorrow`}
        </p>
      )}
    </Link>
  );
}

export function Home() {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGames()
      .then(setGames)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Geogames</h1>
        <p className={styles.subtitle}>Daily geography puzzles</p>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          Failed to load games: {error}
        </p>
      )}

      <main className={styles.grid}>
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </main>
    </div>
  );
}
