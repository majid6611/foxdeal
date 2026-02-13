import express from 'express';
import { channelsRouter } from './routes/channels.js';
import { dealsRouter } from './routes/deals.js';
import { paymentsRouter } from './routes/payments.js';
import { uploadRouter } from './routes/upload.js';

export const app = express();

app.use(express.json());

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Image serving (no auth — must come before other /api routes)
app.use('/api/upload', uploadRouter);

// Routes (all require Telegram auth)
app.use('/api/channels', channelsRouter);
app.use('/api/deals', dealsRouter);
app.use('/api', paymentsRouter);

export function startApi(port: number): void {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[api] Server listening on port ${port}`);
  });
}
