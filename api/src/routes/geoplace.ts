import { Router } from 'express';
import { z } from 'zod';
import { utcDateString } from '../services/daily';
import { recordGeoplacePlay, getTodayStats } from '../services/stats';

export const geoplaceRouter = Router();

const GAME_ID = 'geoplace';

const placementSchema = z.object({
  targetIso3: z.string().length(3),
  clickLat: z.number().min(-90).max(90),
  clickLon: z.number().min(-180).max(180),
  score: z.number().int().min(0).max(100),
});

const resultSchema = z.object({
  score: z.number().int().min(0).max(100),
  placements: z.array(placementSchema),
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

  const { score, placements } = parsed.data;
  const date = utcDateString();

  const recorded = await recordGeoplacePlay({ deviceId, date, score, placements });

  res.cookie('geogames_device_id', deviceId, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
  });

  res.json({ ok: true, recorded });
});

geoplaceRouter.get('/stats/today', async (_req, res) => {
  const date = utcDateString();
  const { plays, totalScore } = await getTodayStats(GAME_ID, date);
  res.json({
    plays,
    avgScore: plays > 0 ? Math.round(totalScore / plays) : 0,
  });
});
