import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './env';
import { healthRouter } from './routes/health';
import { gamesRouter } from './routes/games';
import { whereMostRouter } from './routes/whereMost';
import { geoplaceRouter } from './routes/geoplace';
import { cityRevealRouter } from './routes/cityReveal';

const MAP_NETWORK_ORIGINS = [
  'https://api.maptiler.com',
  // City Reveal landmark thumbnails: en first, then es (many LATAM articles are es-only).
  'https://*.wikipedia.org',
  'https://commons.wikimedia.org',
];
// Wikipedia APIs now return thumbnails on thumb.wikimedia.org (fixed URLs still use upload.wikimedia.org),
// so allow any Wikimedia media host rather than chasing individual hostnames.
const MAP_IMAGE_ORIGINS = ['https://api.maptiler.com', 'https://*.wikimedia.org'];

export function createApp() {
  const app = express();

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          childSrc: ["'self'", 'blob:', 'https://ourworldindata.org'],
          connectSrc: ["'self'", ...MAP_NETWORK_ORIGINS],
          frameSrc: ["'self'", 'https://ourworldindata.org'],
          imgSrc: ["'self'", 'data:', 'blob:', ...MAP_IMAGE_ORIGINS],
          workerSrc: ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: [env.WEB_ORIGIN],
      credentials: true,
    }),
  );
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/health', healthRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/games/where-most', whereMostRouter);
  app.use('/api/games/geoplace', geoplaceRouter);
  app.use('/api/games/city-reveal', cityRevealRouter);

  if (env.NODE_ENV === 'production') {
    const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
      }
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  return app;
}
