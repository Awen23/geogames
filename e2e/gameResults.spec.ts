import { test, expect } from '@playwright/test';

/**
 * Integration tests for the game result endpoints.
 * These exercise the full write path: result submission → daily_stats roll-up → stats read-back.
 *
 * The exact stats assume a fresh e2e database: it is recreated on every run, and this file runs in
 * its own Playwright project before any other spec (playwright.config.ts). Each game's plays are
 * written by one test only, so these tests can still run in parallel with each other. A resubmit
 * from the same device is detected by the response's `recorded` flag, not by counting plays.
 */

// Today's Mostle question is beer per person (e2e/support/knownPuzzles.ts). Andorra #38 (3.313),
// Germany #5 (5.277), France #65 (2.38) and Italy #76 (1.81) cover 12.78 of the top-5 total of
// 29.342: 44%, with Germany the one top-5 country.
const MOSTLE_RESULT = { score: 44, guesses: 4, exactMatches: 1, guessCountries: ['AND', 'DEU', 'FRA', 'ITA'] };

test.describe('Where Most result endpoint', () => {
  // The only test that records Mostle plays before the UI specs run, so today's stats are known exactly.
  test('records a valid result once per device, and counts it in today\'s stats', async ({ request }) => {
    const stats = async () => (await request.get('/api/games/where-most/stats/today')).json();
    expect(await stats()).toEqual({ plays: 0, avgScore: 0, avgGuesses: 0, ranking: expect.any(Array) });

    const first = await request.post('/api/games/where-most/result', { data: MOSTLE_RESULT });
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ ok: true, recorded: true });
    expect(await stats()).toMatchObject({ plays: 1, avgScore: 44, avgGuesses: 4 });

    // Same device (the request context keeps the cookie), same day: accepted but not recorded again
    const second = await request.post('/api/games/where-most/result', { data: MOSTLE_RESULT });
    expect(second.status()).toBe(200);
    expect(await second.json()).toEqual({ ok: true, recorded: false });
    expect(await stats()).toMatchObject({ plays: 1, avgScore: 44, avgGuesses: 4 });
  });

  test('rejects a score or exact-match count that does not match the guessed countries', async ({ request }) => {
    for (const data of [
      { ...MOSTLE_RESULT, score: 45 },
      { ...MOSTLE_RESULT, exactMatches: 2 },
    ]) {
      const res = await request.post('/api/games/where-most/result', { data });
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: 'Submitted result does not match guessed countries' });
    }
  });

  test('rejects score out of range', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: { ...MOSTLE_RESULT, score: 101 },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.score).toBeDefined();
  });

  test('rejects guesses out of range', async ({ request }) => {
    // 6 guesses exceeds the 5-guess limit
    const res = await request.post('/api/games/where-most/result', {
      data: { score: 0, guesses: 6, exactMatches: 0, guessCountries: ['DEU', 'FRA', 'ITA', 'ESP', 'PRT', 'POL'] },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.guesses).toBeDefined();
  });

  test('rejects exact matches greater than guesses', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: { score: 26, guesses: 2, exactMatches: 3, guessCountries: ['DEU', 'FRA'] },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.exactMatches).toBeDefined();
  });

  test('rejects guess country count mismatch', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: { score: 18, guesses: 2, exactMatches: 1, guessCountries: ['DEU'] },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.guessCountries).toBeDefined();
  });

  test('rejects duplicate guess countries', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: { score: 36, guesses: 2, exactMatches: 2, guessCountries: ['DEU', 'DEU'] },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.guessCountries).toBeDefined();
  });

  test('rejects unknown ISO3 guess countries', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: { score: 0, guesses: 1, exactMatches: 0, guessCountries: ['XXX'] },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.guessCountries).toBeDefined();
  });
});

test.describe('GeoPlace result endpoint', () => {
  const validPlacements = [
    { targetIso3: 'DEU', clickLat: 51.0, clickLon: 9.0, score: 85 },
    { targetIso3: 'FRA', clickLat: 46.0, clickLon: 2.0, score: 90 },
    { targetIso3: 'ESP', clickLat: 40.0, clickLon: -3.0, score: 75 },
  ];

  // The only test that records Placle plays, so today's stats are known exactly.
  test('records a valid result once per device, and counts it in today\'s stats', async ({ request }) => {
    const stats = async () => (await request.get('/api/games/geoplace/stats/today')).json();
    expect(await stats()).toEqual({ plays: 0, avgScore: 0 });

    const first = await request.post('/api/games/geoplace/result', {
      data: { score: 83, placements: validPlacements },
    });
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ ok: true, recorded: true });
    expect(await stats()).toEqual({ plays: 1, avgScore: 83 });

    // Same device, same day: accepted but not recorded, so the stats don't change
    const second = await request.post('/api/games/geoplace/result', {
      data: { score: 60, placements: validPlacements },
    });
    expect(second.status()).toBe(200);
    expect(await second.json()).toEqual({ ok: true, recorded: false });
    expect(await stats()).toEqual({ plays: 1, avgScore: 83 });
  });

  test('rejects score out of range', async ({ request }) => {
    const res = await request.post('/api/games/geoplace/result', {
      data: { score: -1, placements: validPlacements },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects missing placements field', async ({ request }) => {
    const res = await request.post('/api/games/geoplace/result', {
      data: { score: 70 },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('City Reveal result endpoint', () => {
  // The only test that records Maple plays before the UI specs run, so today's stats are known exactly.
  test('records a valid result once per device, and counts it in today\'s stats', async ({ request }) => {
    const stats = async () => (await request.get('/api/games/city-reveal/stats/today')).json();
    expect(await stats()).toEqual({ plays: 0, winRate: 0, avgGuesses: 0 });

    const first = await request.post('/api/games/city-reveal/result', {
      data: { won: true, guesses: 2 },
    });
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ ok: true, recorded: true });
    expect(await stats()).toEqual({ plays: 1, winRate: 1, avgGuesses: 2 });

    // Same device, same day: accepted but not recorded, so the stats don't change
    const second = await request.post('/api/games/city-reveal/result', {
      data: { won: false, guesses: 5 },
    });
    expect(second.status()).toBe(200);
    expect(await second.json()).toEqual({ ok: true, recorded: false });
    expect(await stats()).toEqual({ plays: 1, winRate: 1, avgGuesses: 2 });
  });

  test('rejects guesses out of range', async ({ request }) => {
    const res = await request.post('/api/games/city-reveal/result', {
      data: { won: false, guesses: 0 },
    });
    expect(res.status()).toBe(400);
  });
});
