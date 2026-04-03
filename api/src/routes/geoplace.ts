import { Router } from 'express';
import { z } from 'zod';
import { utcDateString } from '../services/daily';
import { recordPlay, getTodayStats } from '../services/stats';

export const geoplaceRouter = Router();

const GAME_ID = 'geoplace';

const resultSchema = z.object({
  score: z.number().int().min(0).max(100),
});

geoplaceRouter.post('/result', async (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const deviceId =
    (req.cookies['geogames_device_id'] as string | undefined) ??
    `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { score } = parsed.data;
  const date = utcDateString();

  // Re-use the generic plays table: guesses = score (0–100), won = score >= 50
  await recordPlay({ deviceId, gameId: GAME_ID, date, won: score >= 50, guesses: score });

  res.cookie('geogames_device_id', deviceId, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
  });

  res.json({ ok: true });
});

geoplaceRouter.get('/stats/today', async (_req, res) => {
  const date = utcDateString();
  const stats = await getTodayStats(GAME_ID, date);
  // avgGuesses holds the average score; bullseyeRate holds the rate of score >= 50
  res.json({ plays: stats.plays, avgScore: stats.avgGuesses });
});
