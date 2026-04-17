import { Router } from 'express';
import { z } from 'zod';
import { seedIndex, utcDateString } from '../services/daily';
import { recordPlay, getTodayStats } from '../services/stats';
import { CITY_REVEAL_CITIES } from '@shared/cityRevealCities';
import { haversineKm, bearingDeg } from '@shared/distance';
import { MAX_GUESSES } from '@shared/cityRevealTypes';
import type { CityRevealTodayResponse, CityRevealGuessResponse } from '@shared/cityRevealTypes';

export const cityRevealRouter = Router();

const GAME_ID = 'city-reveal';

const IMPLEMENTED_CITIES = CITY_REVEAL_CITIES.filter((c) => c.implemented === true);

if (IMPLEMENTED_CITIES.length === 0) {
  throw new Error('[city-reveal] No implemented cities — set implemented: true on at least one entry in cityRevealCities.ts');
}

function getTodayCity() {
  const date = utcDateString();
  const idx = seedIndex(GAME_ID, date, IMPLEMENTED_CITIES.length);
  return { city: IMPLEMENTED_CITIES[idx], date };
}

cityRevealRouter.get('/today', (_req, res) => {
  const { city, date } = getTodayCity();
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

cityRevealRouter.post('/guess', (req, res) => {
  const parsed = guessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { cityId } = parsed.data;
  const { city: todayCity } = getTodayCity();
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
  const { date } = getTodayCity();

  await recordPlay({ deviceId, gameId: GAME_ID, date, won, guesses });

  res.cookie('geogames_device_id', deviceId, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
  });

  res.json({ ok: true });
});

cityRevealRouter.get('/stats/today', async (_req, res) => {
  const { date } = getTodayCity();
  const { plays, bullseyeRate: perfectRate, avgGuesses } = await getTodayStats(GAME_ID, date);
  res.json({ plays, perfectRate, avgGuesses });
});
