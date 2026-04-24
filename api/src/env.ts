import path from 'path';
import { z } from 'zod';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '../.env') });

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    WEB_ORIGIN: z.string().default('http://localhost:5173'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') {
      return;
    }
    if (data.WEB_ORIGIN === 'http://localhost:5173') {
      ctx.addIssue({
        code: 'custom',
        message:
          'WEB_ORIGIN must be set to the public site URL in production (e.g. https://your-app.fly.dev).',
        path: ['WEB_ORIGIN'],
      });
    }
  });

export const env = envSchema.parse(process.env);
