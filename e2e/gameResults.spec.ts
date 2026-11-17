import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { rawScore, scorePercent } from '@shared/whereMostScore';

test.describe.configure({ mode: 'serial' });

/**
 * Integration tests for the game result endpoints.
 * These exercise the full write path: result submission → daily_stats roll-up → stats read-back.
 */

interface WhereMostToday {
  maxScore: number;
}

interface WhereMostGrade {
  value: number | null;
  isTopFive: boolean;
}

async function whereMostPayload(request: APIRequestContext, guessCountries: string[]) {
  const today = (await (await request.get('/api/games/where-most/today')).json()) as WhereMostToday;
  const grades = await Promise.all(
    guessCountries.map(async (iso3) => {
      const res = await request.post('/api/games/where-most/grade', { data: { iso3 } });
      return (await res.json()) as WhereMostGrade;
    }),
  );
  return {
    score: scorePercent(rawScore(grades), today.maxScore),
    guesses: guessCountries.length,
    exactMatches: grades.filter((grade) => grade.isTopFive).length,
    guessCountries,
  };
}

test.describe('Where Most result endpoint', () => {
  test('accepts valid score and guesses', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: await whereMostPayload(request, ['AND', 'DEU', 'FRA', 'ITA']),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });

  test('rejects score out of range', async ({ request }) => {
    const payload = await whereMostPayload(request, ['DEU', 'FRA', 'ITA']);
    const res = await request.post('/api/games/where-most/result', {
      data: { ...payload, score: 101 },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects guesses out of range', async ({ request }) => {
    // 6 guesses exceeds the 5-guess limit
    const payload = await whereMostPayload(request, ['DEU', 'FRA', 'ITA', 'ESP', 'PRT', 'POL']);
    const res = await request.post('/api/games/where-most/result', { data: payload });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.guesses).toBeDefined();
  });

  test('rejects exact matches greater than guesses', async ({ request }) => {
    const payload = await whereMostPayload(request, ['DEU', 'FRA']);
    const res = await request.post('/api/games/where-most/result', {
      data: { ...payload, exactMatches: 3 },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects guess country count mismatch', async ({ request }) => {
    const payload = await whereMostPayload(request, ['DEU']);
    const res = await request.post('/api/games/where-most/result', {
      data: { ...payload, guesses: 2 },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects duplicate guess countries', async ({ request }) => {
    const payload = await whereMostPayload(request, ['DEU']);
    const res = await request.post('/api/games/where-most/result', {
      data: { ...payload, guesses: 2, guessCountries: ['DEU', 'DEU'] },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects unknown ISO3 guess countries', async ({ request }) => {
    const res = await request.post('/api/games/where-most/result', {
      data: { score: 0, guesses: 1, exactMatches: 0, guessCountries: ['XXX'] },
    });
    expect(res.status()).toBe(400);
  });

  test('stats/today counts a submitted play', async ({ request }) => {
    // Submit a result, then verify stats endpoint increments plays
    const before = await request.get('/api/games/where-most/stats/today');
    const beforeBody = await before.json();
    const playsBefore = (beforeBody as { plays: number }).plays;

    const submit = await request.post('/api/games/where-most/result', {
      data: await whereMostPayload(request, ['DEU', 'FRA']),
    });
    expect(submit.status()).toBe(200);

    const after = await request.get('/api/games/where-most/stats/today');
    const afterBody = await after.json();
    // Each test gets a fresh request context (no device cookie), so this counts as a new play
    expect((afterBody as { plays: number }).plays).toBeGreaterThan(playsBefore);
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
    const payload = await whereMostPayload(request, ['DEU', 'FRA', 'ITA', 'ESP', 'PRT']);
    const firstSubmit = await request.post('/api/games/where-most/result', {
      data: payload,
    });
    expect(firstSubmit.status()).toBe(200);
    // Second submission from same device (same cookie jar)
    const secondSubmit = await request.post('/api/games/where-most/result', {
      data: payload,
    });
    expect(secondSubmit.status()).toBe(200);

    const after = await request.get('/api/games/where-most/stats/today');
    const playsAfter = ((await after.json()) as { plays: number }).plays;

    // Counted exactly once; relies on this file being serial and no other spec posting results meanwhile
    expect(playsAfter).toBe(playsBefore + 1);
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

    const firstSubmit = await request.post('/api/games/geoplace/result', {
      data: { score: 60, placements: validPlacements },
    });
    expect(firstSubmit.status()).toBe(200);
    const secondSubmit = await request.post('/api/games/geoplace/result', {
      data: { score: 60, placements: validPlacements },
    });
    expect(secondSubmit.status()).toBe(200);

    const after = await request.get('/api/games/geoplace/stats/today');
    const playsAfter = ((await after.json()) as { plays: number }).plays;
    // Counted exactly once; relies on this file being serial and no other spec posting results meanwhile
    expect(playsAfter).toBe(playsBefore + 1);
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

    const firstSubmit = await request.post('/api/games/city-reveal/result', {
      data: { won: false, guesses: 5 },
    });
    expect(firstSubmit.status()).toBe(200);
    const secondSubmit = await request.post('/api/games/city-reveal/result', {
      data: { won: false, guesses: 5 },
    });
    expect(secondSubmit.status()).toBe(200);

    const after = await request.get('/api/games/city-reveal/stats/today');
    const playsAfter = ((await after.json()) as { plays: number }).plays;
    // Counted exactly once; relies on this file being serial and no other spec posting results meanwhile
    expect(playsAfter).toBe(playsBefore + 1);
  });
});
