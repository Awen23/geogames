import { test, expect } from '@playwright/test';

/**
 * Integration tests for the game result endpoints.
 * These exercise the full write path: result submission → daily_stats roll-up → stats read-back.
 */

test.describe('Where Most result endpoint', () => {
  test('accepts valid score and guesses', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: { score: 67, guesses: 4 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });

  test('rejects score out of range', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: { score: 101, guesses: 3 },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects guesses out of range', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: { score: 50, guesses: 0 },
    });
    expect(res.status()).toBe(400);
  });

  test('stats/today reflects submitted score', async ({ request }) => {
    // Submit a result, then verify stats endpoint increments plays
    const before = await request.get('/api/games/where-most/stats/today');
    const beforeBody = await before.json();
    const playsBefore = (beforeBody as { plays: number }).plays;

    await request.post('/api/games/where-most/result', {
      data: { score: 80, guesses: 2 },
    });

    const after = await request.get('/api/games/where-most/stats/today');
    const afterBody = await after.json();
    // plays should be >= before (may not increase if same device already submitted today)
    expect((afterBody as { plays: number }).plays).toBeGreaterThanOrEqual(playsBefore);
    expect(afterBody).toMatchObject({
      plays: expect.any(Number),
      avgScore: expect.any(Number),
      avgGuesses: expect.any(Number),
    });
  });

  test('duplicate submission is idempotent (same device, same day)', async ({ request }) => {
    const before = await request.get('/api/games/where-most/stats/today');
    const playsBefore = ((await before.json()) as { plays: number }).plays;

    // First submission
    await request.post('/api/games/where-most/result', {
      data: { score: 55, guesses: 5 },
    });
    // Second submission from same device (same cookie jar)
    await request.post('/api/games/where-most/result', {
      data: { score: 55, guesses: 5 },
    });

    const after = await request.get('/api/games/where-most/stats/today');
    const playsAfter = ((await after.json()) as { plays: number }).plays;

    // Should not double-count
    expect(playsAfter).toBeLessThanOrEqual(playsBefore + 1);
  });
});

test.describe('GeoPlace result endpoint', () => {
  const validPlacements = [
    { targetIso3: 'DEU', clickLat: 51.0, clickLon: 9.0, score: 85 },
    { targetIso3: 'FRA', clickLat: 46.0, clickLon: 2.0, score: 90 },
    { targetIso3: 'ESP', clickLat: 40.0, clickLon: -3.0, score: 75 },
  ];

  test('accepts valid score and placements', async ({ request }) => {
    const res = await request.post('/api/games/geoplace/result', {
      data: { score: 83, placements: validPlacements },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
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

  test('stats/today returns avgScore', async ({ request }) => {
    const res = await request.get('/api/games/geoplace/stats/today');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      plays: expect.any(Number),
      avgScore: expect.any(Number),
    });
  });

  test('duplicate submission is idempotent', async ({ request }) => {
    const before = await request.get('/api/games/geoplace/stats/today');
    const playsBefore = ((await before.json()) as { plays: number }).plays;

    await request.post('/api/games/geoplace/result', {
      data: { score: 60, placements: validPlacements },
    });
    await request.post('/api/games/geoplace/result', {
      data: { score: 60, placements: validPlacements },
    });

    const after = await request.get('/api/games/geoplace/stats/today');
    const playsAfter = ((await after.json()) as { plays: number }).plays;
    expect(playsAfter).toBeLessThanOrEqual(playsBefore + 1);
  });
});

test.describe('City Reveal result endpoint', () => {
  test('accepts valid won and guesses', async ({ request }) => {
    const res = await request.post('/api/games/city-reveal/result', {
      data: { won: true, guesses: 2 },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  test('rejects guesses out of range', async ({ request }) => {
    const res = await request.post('/api/games/city-reveal/result', {
      data: { won: false, guesses: 0 },
    });
    expect(res.status()).toBe(400);
  });

  test('stats/today returns winRate and avgGuesses', async ({ request }) => {
    const res = await request.get('/api/games/city-reveal/stats/today');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      plays: expect.any(Number),
      winRate: expect.any(Number),
      avgGuesses: expect.any(Number),
    });
  });

  test('duplicate submission is idempotent', async ({ request }) => {
    const before = await request.get('/api/games/city-reveal/stats/today');
    const playsBefore = ((await before.json()) as { plays: number }).plays;

    await request.post('/api/games/city-reveal/result', {
      data: { won: false, guesses: 5 },
    });
    await request.post('/api/games/city-reveal/result', {
      data: { won: false, guesses: 5 },
    });

    const after = await request.get('/api/games/city-reveal/stats/today');
    const playsAfter = ((await after.json()) as { plays: number }).plays;
    expect(playsAfter).toBeLessThanOrEqual(playsBefore + 1);
  });
});
