import { Router } from 'express';
import { z } from 'zod';
import { utcDateString } from '../services/daily';
import { recordCityRevealPlay, getTodayStats } from '../services/stats';
import { getScheduledPuzzleIndex } from '../services/puzzleSchedule';
import { CITY_REVEAL_CITIES, IMPLEMENTED_CITIES } from '@shared/cityRevealCities';
import { haversineKm, bearingDeg } from '@shared/distance';
import { MAX_GUESSES } from '@shared/cityRevealTypes';
import type { CityRevealTodayResponse, CityRevealGuessResponse } from '@shared/cityRevealTypes';

export const cityRevealRouter = Router();

const GAME_ID = 'city-reveal';

if (IMPLEMENTED_CITIES.length === 0) {
  throw new Error('[city-reveal] No implemented cities — set implemented: true on at least one entry in cityRevealCities.ts');
}

async function getTodayCity() {
  const date = utcDateString();
  const idx = await getScheduledPuzzleIndex(GAME_ID, date, IMPLEMENTED_CITIES.length);
  return { city: IMPLEMENTED_CITIES[idx], date };
}

cityRevealRouter.get('/today', async (_req, res) => {
  const { city, date } = await getTodayCity();
  const response: CityRevealTodayResponse = {
    date,
    cityId: city.id,
    lat: city.lat,
    lon: city.lon,
    zoom: city.zoom,
  };
  res.json(response);
});

const guessSchema = z.object({
  cityId: z.string().min(1).max(64),
});

cityRevealRouter.post('/guess', async (req, res) => {
  const parsed = guessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { cityId } = parsed.data;
  const { city: todayCity } = await getTodayCity();
  const guessedCity = CITY_REVEAL_CITIES.find((c) => c.id === cityId);

  if (!guessedCity) {
    res.status(404).json({ error: 'Unknown city' });
    return;
  }

  const correct = guessedCity.id === todayCity.id;

  if (correct) {
    const response: CityRevealGuessResponse = { correct: true, city: todayCity };
    res.json(response);
    return;
  }

  const distanceKm = Math.round(haversineKm(guessedCity, todayCity));
  const bearing = Math.round(bearingDeg(guessedCity, todayCity));
  const response: CityRevealGuessResponse = { correct: false, distanceKm, bearing };
  res.json(response);
});

const resultSchema = z.object({
  won: z.boolean(),
  guesses: z.number().int().min(1).max(MAX_GUESSES),
});

cityRevealRouter.post('/result', async (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const deviceId =
    (req.cookies['geogames_device_id'] as string | undefined) ??
    `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { won, guesses } = parsed.data;
  const { date } = await getTodayCity();

  const recorded = await recordCityRevealPlay({ deviceId, date, won, guesses });

  res.cookie('geogames_device_id', deviceId, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
  });

  res.json({ ok: true, recorded });
});

cityRevealRouter.get('/stats/today', async (_req, res) => {
  const { date } = await getTodayCity();
  const { plays, wins, totalGuesses } = await getTodayStats(GAME_ID, date);
  res.json({
    plays,
    winRate: plays > 0 ? wins / plays : 0,
    avgGuesses: plays > 0 ? Math.round((totalGuesses / plays) * 10) / 10 : 0,
  });
});
