import { z } from 'zod';
import { config } from 'dotenv';

config({ path: '../.env' });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);
