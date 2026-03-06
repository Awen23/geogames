import { Router } from 'express';
import { z } from 'zod';
import { seedIndex, utcDateString } from '../services/daily';
import { scoreGuess } from '../services/scoring';
import { recordPlay, getTodayStats } from '../services/stats';
import { questions } from '../data/questions';
import centroids from '@shared/centroids.json';

export const whereMostRouter = Router();

const GAME_ID = 'where-most';

function getTodayQuestion() {
  const date = utcDateString();
  const idx = seedIndex(GAME_ID, date, questions.length);
  return { question: questions[idx], date };
}

whereMostRouter.get('/today', (_req, res) => {
  const { question, date } = getTodayQuestion();
  const { id, prompt, metric, unit, source, sourceUrl } = question;
  res.json({ id, date, prompt, metric, unit, source, sourceUrl });
});

const gradeSchema = z.object({
  iso3: z.string().length(3).toUpperCase(),
  guessIndex: z.number().int().min(0).max(4),
});

whereMostRouter.post('/grade', (req, res) => {
  const parsed = gradeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { iso3 } = parsed.data;
  const { question } = getTodayQuestion();
  const result = scoreGuess(question, iso3, centroids);
  res.json(result);
});

const resultSchema = z.object({
  won: z.boolean(),
  guesses: z.number().int().min(1).max(5),
});

whereMostRouter.post('/result', async (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const deviceId =
    (req.cookies['geogames_device_id'] as string | undefined) ??
    `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { won, guesses } = parsed.data;
  const { date } = getTodayQuestion();

  await recordPlay({ deviceId, gameId: GAME_ID, date, won, guesses });

  res.cookie('geogames_device_id', deviceId, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
  });

  res.json({ ok: true });
});

whereMostRouter.get('/stats/today', async (_req, res) => {
  const { date } = getTodayQuestion();
  const stats = await getTodayStats(GAME_ID, date);
  res.json(stats);
});
