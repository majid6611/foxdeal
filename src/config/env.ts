import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  MINI_APP_URL: z.string().url().default('http://localhost:5173'),
  POST_DURATION_MINUTES: z.coerce.number().positive().default(2),
  PAYMENT_TIMEOUT_HOURS: z.coerce.number().positive().default(2),
  APPROVAL_TIMEOUT_HOURS: z.coerce.number().positive().default(24),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
