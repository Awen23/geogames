import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './env';
import { healthRouter } from './routes/health';
import { gamesRouter } from './routes/games';
import { whereMostRouter } from './routes/whereMost';
import { geoplaceRouter } from './routes/geoplace';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: [env.WEB_ORIGIN], credentials: true }));
  app.use(morgan('dev'));
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/health', healthRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/games/where-most', whereMostRouter);
  app.use('/api/games/geoplace', geoplaceRouter);

  return app;
}
