import express from 'express';
import { channelsRouter } from './routes/channels.js';
import { dealsRouter } from './routes/deals.js';
import { paymentsRouter } from './routes/payments.js';
import { uploadRouter } from './routes/upload.js';
import { earningsRouter } from './routes/earnings.js';

export const app = express();

app.use(express.json());

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Click tracking redirect (no auth — public URL for inline buttons)
app.get('/api/click/:dealId', async (req, res) => {
  try {
    const { getDealById, incrementClickCount, spendClick, getChannelById } = await import('../db/queries.js');
    const dealId = Number(req.params.dealId);
    const deal = await getDealById(dealId);

    if (!deal || !deal.ad_link) {
      res.status(404).send('Link not found');
      return;
    }

    if (deal.pricing_model === 'cpc' && deal.status === 'posted') {
      // CPC deal: deduct click cost from budget
      const channel = await getChannelById(deal.channel_id);
      const cpcPrice = channel?.cpc_price ?? 0;

      if (cpcPrice > 0) {
        const updated = await spendClick(dealId, cpcPrice);

        // Check if budget is now exhausted
        if (updated && updated.budget_spent >= updated.budget) {
          // Budget exhausted — complete the CPC deal (remove post, settle)
          const { completeCpcDeal } = await import('../bot/jobs.js');
          completeCpcDeal(dealId).catch((err: unknown) =>
            console.error(`[click] Failed to complete CPC deal ${dealId}:`, err),
          );
        }
      } else {
        // Fallback: just increment click count
        incrementClickCount(dealId).catch((err: unknown) =>
          console.error(`[click] Failed to increment for deal ${dealId}:`, err),
        );
      }
    } else {
      // Time-based deal or non-posted: just increment click count
      incrementClickCount(dealId).catch((err: unknown) =>
        console.error(`[click] Failed to increment for deal ${dealId}:`, err),
      );
    }

    res.redirect(302, deal.ad_link);
  } catch (err) {
    console.error('[click] Error:', err);
    res.status(500).send('Server error');
  }
});

// Image serving (no auth — must come before other /api routes)
app.use('/api/upload', uploadRouter);

// Routes (all require Telegram auth)
app.use('/api/channels', channelsRouter);
app.use('/api/deals', dealsRouter);
app.use('/api/earnings', earningsRouter);
app.use('/api', paymentsRouter);

export function startApi(port: number): void {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[api] Server listening on port ${port}`);
  });
}
