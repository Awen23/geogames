import { Router } from 'express';
import { z } from 'zod';
import { utcDateString } from '../services/daily';
import { scoreGuess } from '../services/scoring';
import { MAX_GUESSES, TOP_N, maxScore, rawScore, scorePercent } from '@shared/whereMostScore';
import { recordWhereMostPlay, getTodayStats } from '../services/stats';
import { getScheduledPuzzleIndex } from '../services/puzzleSchedule';
import { questions } from '../data/questions';
import { VALID_COUNTRY_ISO3S } from '@shared/countryIso3';

export const whereMostRouter = Router();

const GAME_ID = 'where-most';

async function getTodayQuestion() {
  const date = utcDateString();
  const idx = await getScheduledPuzzleIndex(GAME_ID, date, questions.length);
  return { question: questions[idx], date };
}

whereMostRouter.get('/today', async (_req, res) => {
  const { question, date } = await getTodayQuestion();
  const { id, prompt, description, metric, unit, year, source, sourceUrl, icon, mapEmbedUrl } = question;
  res.json({ id, date, prompt, description, metric, unit, year, source, sourceUrl, icon, mapEmbedUrl, maxScore: maxScore(question.ranking) });
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

const resultSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    guesses: z.number().int().min(0).max(MAX_GUESSES),
    exactMatches: z.number().int().min(0).max(TOP_N),
    guessCountries: z.array(z.string().length(3).toUpperCase()).max(MAX_GUESSES),
  })
  .refine((result) => result.exactMatches <= result.guesses, {
    message: 'exactMatches cannot exceed guesses',
    path: ['exactMatches'],
  })
  .refine((result) => result.guessCountries.length === result.guesses, {
    message: 'guessCountries length must match guesses',
    path: ['guessCountries'],
  })
  .refine((result) => new Set(result.guessCountries).size === result.guessCountries.length, {
    message: 'guessCountries must not contain duplicates',
    path: ['guessCountries'],
  })
  .refine((result) => result.guessCountries.every((iso3) => VALID_COUNTRY_ISO3S.has(iso3)), {
    message: 'guessCountries must contain valid countries',
    path: ['guessCountries'],
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

  const { score: submittedScore, guesses, exactMatches: submittedExactMatches, guessCountries } = parsed.data;
  const { question, date } = await getTodayQuestion();

  if (guessCountries.length === 0) {
    if (guesses !== 0 || submittedExactMatches !== 0 || submittedScore !== 0) {
      res.status(400).json({ error: 'Empty submission must have score 0, guesses 0, exactMatches 0' });
      return;
    }
    const recorded = await recordWhereMostPlay({ deviceId, date, guesses: 0, score: 0, exactMatches: 0, guessCountries: [] });

    res.cookie('geogames_device_id', deviceId, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'strict',
    });

    res.json({ ok: true, recorded });
    return;
  }

  const guessResults = guessCountries.map((iso3) => scoreGuess(question, iso3));
  const exactMatches = guessResults.filter((result) => result.isTopFive).length;
  const score = scorePercent(rawScore(guessResults), maxScore(question.ranking));

  if (score !== submittedScore || exactMatches !== submittedExactMatches) {
    res.status(400).json({ error: 'Submitted result does not match guessed countries' });
    return;
  }

  const recorded = await recordWhereMostPlay({ deviceId, date, guesses, score, exactMatches, guessCountries });

  res.cookie('geogames_device_id', deviceId, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
  });

  res.json({ ok: true, recorded });
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
