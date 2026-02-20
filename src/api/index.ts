import crypto from 'crypto';
import express from 'express';
import { channelsRouter } from './routes/channels.js';
import { dealsRouter } from './routes/deals.js';
import { paymentsRouter } from './routes/payments.js';
import { uploadRouter } from './routes/upload.js';
import { earningsRouter } from './routes/earnings.js';
import { campaignsRouter } from './routes/campaigns.js';
import { env } from '../config/env.js';

export const app = express();

// Trust proxy so req.ip returns the real client IP behind Nginx
app.set('trust proxy', true);

app.use(express.json());

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Config endpoint (public — returns non-sensitive config for the frontend)
app.get('/api/config', (_req, res) => {
  res.json({
    tonNetwork: env.TON_NETWORK,
    adminChannelId: env.ADMIN_CHANNEL_ID,
  });
});

/**
 * Create a visitor fingerprint hash from IP + User-Agent.
 * Not perfect but good enough for basic click fraud prevention.
 */
function visitorHash(ip: string, ua: string): string {
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

// Click tracking + redirect (public — used as inline button URL in channel posts)
app.get('/api/click/:dealId', async (req, res) => {
  try {
    const { getDealById, getChannelById, recordVisitorClick, spendClick, incrementClickCount } = await import('../db/queries.js');
    const dealId = Number(req.params.dealId);
    const deal = await getDealById(dealId);

    if (!deal || !deal.ad_link) {
      res.status(404).send('Link not found');
      return;
    }

    // Build visitor fingerprint from IP + User-Agent
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const ua = req.headers['user-agent'] ?? 'unknown';
    const hash = visitorHash(ip, ua);

    // Try to record as a unique visitor click
    const isNewClick = await recordVisitorClick(dealId, hash);

    if (isNewClick) {
      if (deal.pricing_model === 'cpc' && deal.status === 'posted') {
        // CPC deal: deduct click cost from budget
        const channel = await getChannelById(deal.channel_id);
        const cpcPrice = channel ? Number(channel.cpc_price) : 0;

        if (cpcPrice > 0) {
          const updated = await spendClick(dealId, cpcPrice);

          // Check if budget is now exhausted
          if (updated && Number(updated.budget_spent) >= updated.budget) {
            const { completeCpcDeal } = await import('../bot/jobs.js');
            completeCpcDeal(dealId).catch((err: unknown) =>
              console.error(`[click] Failed to complete CPC deal ${dealId}:`, err),
            );
          }
        }

        console.log(`[click] New unique CPC click: deal ${dealId}, hash ${hash.slice(0, 8)}...`);
      } else {
        // Time-based deal: just increment click count
        incrementClickCount(dealId).catch(() => {});
        console.log(`[click] New unique click: deal ${dealId}, hash ${hash.slice(0, 8)}...`);
      }
    } else {
      console.log(`[click] Duplicate click ignored: deal ${dealId}, hash ${hash.slice(0, 8)}...`);
    }

    // Always redirect to the final URL (seamless for the user)
    res.redirect(302, deal.ad_link);
  } catch (err) {
    console.error('[click] Error:', err);
    res.status(500).send('Server error');
  }
});

/**
 * Track a click from the Mini App (called via startapp deep link flow).
 * Uses Telegram user ID from query param for deduplication (much better than IP+UA).
 * Returns the destination URL as JSON so the Mini App can open it.
 */
app.get('/api/track-click/:dealId', async (req, res) => {
  try {
    const { getDealById, getChannelById, recordVisitorClick, spendClick, incrementClickCount } = await import('../db/queries.js');
    const dealId = Number(req.params.dealId);
    const tgUserId = req.query.uid as string | undefined;
    const deal = await getDealById(dealId);

    if (!deal || !deal.ad_link) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    // Use Telegram user ID for dedup if available, fallback to IP+UA
    const hash = tgUserId
      ? `tg_${tgUserId}`
      : visitorHash(req.ip ?? 'unknown', req.headers['user-agent'] ?? 'unknown');

    const isNewClick = await recordVisitorClick(dealId, hash);

    if (isNewClick) {
      if (deal.pricing_model === 'cpc' && deal.status === 'posted') {
        const channel = await getChannelById(deal.channel_id);
        const cpcPrice = channel ? Number(channel.cpc_price) : 0;

        if (cpcPrice > 0) {
          const updated = await spendClick(dealId, cpcPrice);
          if (updated && Number(updated.budget_spent) >= updated.budget) {
            const { completeCpcDeal } = await import('../bot/jobs.js');
            completeCpcDeal(dealId).catch((err: unknown) =>
              console.error(`[click] Failed to complete CPC deal ${dealId}:`, err),
            );
          }
        }
        console.log(`[click] New unique CPC click: deal ${dealId}, hash ${hash.slice(0, 8)}...`);
      } else {
        incrementClickCount(dealId).catch(() => {});
        console.log(`[click] New unique click: deal ${dealId}, hash ${hash.slice(0, 8)}...`);
      }
    } else {
      console.log(`[click] Duplicate click ignored: deal ${dealId}, hash ${hash.slice(0, 8)}...`);
    }

    // Return the destination URL (Mini App will open it)
    res.json({ url: deal.ad_link, tracked: isNewClick });
  } catch (err) {
    console.error('[track-click] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Image serving (no auth — must come before other /api routes)
app.use('/api/upload', uploadRouter);

// Routes (all require Telegram auth)
app.use('/api/channels', channelsRouter);
app.use('/api/deals', dealsRouter);
app.use('/api/earnings', earningsRouter);
app.use('/api', campaignsRouter);
app.use('/api', paymentsRouter);

export function startApi(port: number): void {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[api] Server listening on port ${port}`);
  });
}
