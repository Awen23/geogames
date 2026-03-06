import { Router } from 'express';

export const gamesRouter = Router();

gamesRouter.get('/', (_req, res) => {
  res.json([
    {
      id: 'where-most',
      title: 'Where Most',
      tagline: 'Which country consumes the most?',
      enabled: true,
    },
  ]);
});
