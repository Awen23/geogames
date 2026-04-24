import { Router } from 'express';

export const gamesRouter = Router();

gamesRouter.get('/', (_req, res) => {
  res.json([
    {
      id: 'where-most',
      title: 'Mostle',
      icon: '📊',
      tagline: 'Which country _______s the most?',
      enabled: true,
    },
    {
      id: 'geoplace',
      title: 'Placle',
      icon: '📍',
      tagline: 'Place the country on the globe',
      enabled: true,
    },
    {
      id: 'city-reveal',
      title: 'Maple',
      icon: '🗺️',
      tagline: 'Guess the city from its map',
      enabled: true,
    },
  ]);
});
