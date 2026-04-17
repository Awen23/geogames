import { Router } from 'express';
import { z } from 'zod';
import { utcDateString } from '../services/daily';
import { scoreGuess, maxScore } from '../services/scoring';
import { recordWhereMostPlay, getTodayStats } from '../services/stats';
import { getScheduledPuzzleIndex } from '../services/puzzleSchedule';
import { questions } from '../data/questions';

export const whereMostRouter = Router();

const GAME_ID = 'where-most';

async function getTodayQuestion() {
  const date = utcDateString();
  const idx = await getScheduledPuzzleIndex(GAME_ID, date, questions.length);
  return { question: questions[idx], date };
}

whereMostRouter.get('/today', async (_req, res) => {
  const { question, date } = await getTodayQuestion();
  const { id, prompt, description, metric, unit, source, sourceUrl, icon, mapEmbedUrl } = question;
  res.json({ id, date, prompt, description, metric, unit, source, sourceUrl, icon, mapEmbedUrl, maxScore: maxScore(question) });
});

const gradeSchema = z.object({
  iso3: z.string().length(3).toUpperCase(),
});

whereMostRouter.post('/grade', async (req, res) => {
  const parsed = gradeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { iso3 } = parsed.data;
  const { question } = await getTodayQuestion();
  const result = scoreGuess(question, iso3);
  res.json(result);
});

const resultSchema = z.object({
  score: z.number().int().min(0).max(100),
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

  const { score, guesses } = parsed.data;
  const { date } = await getTodayQuestion();

  await recordWhereMostPlay({ deviceId, date, guesses, score });

  res.cookie('geogames_device_id', deviceId, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
  });

  res.json({ ok: true });
});

whereMostRouter.get('/stats/today', async (_req, res) => {
  const { date, question } = await getTodayQuestion();
  const { plays, totalGuesses, totalScore } = await getTodayStats(GAME_ID, date);
  res.json({
    plays,
    avgScore: plays > 0 ? Math.round(totalScore / plays) : 0,
    avgGuesses: plays > 0 ? Math.round((totalGuesses / plays) * 10) / 10 : 0,
    ranking: question.ranking,
  });
});
