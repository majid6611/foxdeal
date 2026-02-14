import { Router } from 'express';
import { z } from 'zod';
import { telegramAuth } from '../middleware/auth.js';
import {
  createDeal,
  getDealById,
  getDealsByAdvertiser,
  getIncomingDealsForOwner,
  getChannelById,
} from '../../db/queries.js';
import { upsertUser, getUserByTelegramId } from '../../db/queries.js';
import { transitionDeal } from '../../escrow/transitions.js';
import { notifyOwnerNewDeal, notifyAdvertiserApproved, notifyAdvertiserRejected } from '../../bot/notifications.js';
import { sendDealForAdminReview } from '../../bot/adminChannel.js';

export const dealsRouter = Router();

dealsRouter.use(telegramAuth);

const createDealSchema = z.object({
  channelId: z.number().int().positive(),
  adText: z.string().min(1).max(4096),
  adImageUrl: z.string().min(1).nullable().optional(),
  adLink: z.string().url().nullable().optional(),
  pricingModel: z.enum(['time', 'cpc']).default('time'),
  budget: z.number().int().positive().optional(),
});

// GET /api/deals
dealsRouter.get('/', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) { res.json([]); return; }
    const deals = await getDealsByAdvertiser(user.id);
    res.json(deals);
  } catch (err) {
    console.error('[api] GET /deals error:', err);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/incoming
dealsRouter.get('/incoming', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) { res.json([]); return; }
    const deals = await getIncomingDealsForOwner(user.id);
    res.json(deals);
  } catch (err) {
    console.error('[api] GET /deals/incoming error:', err);
    res.status(500).json({ error: 'Failed to fetch incoming deals' });
  }
});

// GET /api/deals/:id
dealsRouter.get('/:id', async (req, res) => {
  try {
    const deal = await getDealById(Number(req.params.id));
    if (!deal) { res.status(404).json({ error: 'Deal not found' }); return; }
    res.json(deal);
  } catch (err) {
    console.error('[api] GET /deals/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

// POST /api/deals — create a new deal (advertiser)
dealsRouter.post('/', async (req, res) => {
  try {
    const body = createDealSchema.parse(req.body);

    const channel = await getChannelById(body.channelId);
    if (!channel || !channel.is_active) {
      res.status(400).json({ error: 'Channel not found or inactive' });
      return;
    }

    // Validate CPC pricing
    const isCpc = body.pricingModel === 'cpc';
    if (isCpc) {
      if (channel.cpc_price <= 0) {
        res.status(400).json({ error: 'This channel does not support cost-per-click pricing' });
        return;
      }
      if (!body.budget || body.budget < channel.cpc_price) {
        res.status(400).json({ error: `Budget must be at least ${channel.cpc_price} Stars (1 click)` });
        return;
      }
      if (!body.adLink) {
        res.status(400).json({ error: 'CPC deals require a link for the inline button' });
        return;
      }
    }

    const user = await upsertUser(req.telegramUser!.id, 'advertiser');

    // For CPC, price = budget; for time, price = channel.price
    const dealPrice = isCpc ? body.budget! : channel.price;

    const deal = await createDeal(
      user.id,
      body.channelId,
      body.adText,
      body.adImageUrl ?? null,
      body.adLink ?? null,
      channel.duration_hours,
      dealPrice,
      body.pricingModel,
      isCpc ? body.budget! : 0,
    );

    // Demo mode: skip admin review, go straight to channel owner approval
    // TODO: restore admin review after demo — change back to 'pending_admin' and sendDealForAdminReview
    const updated = await transitionDeal(deal.id, 'created', 'pending_approval');

    notifyOwnerNewDeal(updated).catch((e) =>
      console.error('[api] notify owner error:', e),
    );

    res.status(201).json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    if ((err as any)?.constraint === 'idx_deals_active_unique') {
      res.status(409).json({ error: 'You already have an active deal for this channel. Cancel or wait for it to complete before creating a new one.' });
      return;
    }
    console.error('[api] POST /deals error:', err);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// POST /api/deals/:id/approve
dealsRouter.post('/:id/approve', async (req, res) => {
  try {
    const deal = await getDealById(Number(req.params.id));
    if (!deal) { res.status(404).json({ error: 'Deal not found' }); return; }

    const channel = await getChannelById(deal.channel_id);
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!channel || !user || channel.owner_id !== user.id) {
      res.status(403).json({ error: 'Only the channel owner can approve deals' });
      return;
    }

    const updated = await transitionDeal(deal.id, 'pending_approval', 'approved');
    notifyAdvertiserApproved(updated).catch((e) => console.error('[api] notify error:', e));
    res.json(updated);
  } catch (err) {
    console.error('[api] POST /deals/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve deal' });
  }
});

// POST /api/deals/:id/reject
dealsRouter.post('/:id/reject', async (req, res) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1).max(500).optional() }).parse(req.body);

    const deal = await getDealById(Number(req.params.id));
    if (!deal) { res.status(404).json({ error: 'Deal not found' }); return; }

    const channel = await getChannelById(deal.channel_id);
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!channel || !user || channel.owner_id !== user.id) {
      res.status(403).json({ error: 'Only the channel owner can reject deals' });
      return;
    }

    const updated = await transitionDeal(deal.id, 'pending_approval', 'rejected', {
      rejection_reason: reason ?? null,
    });
    notifyAdvertiserRejected(updated).catch((e) => console.error('[api] notify error:', e));
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('[api] POST /deals/:id/reject error:', err);
    res.status(500).json({ error: 'Failed to reject deal' });
  }
});

// POST /api/deals/:id/cancel
dealsRouter.post('/:id/cancel', async (req, res) => {
  try {
    const deal = await getDealById(Number(req.params.id));
    if (!deal) { res.status(404).json({ error: 'Deal not found' }); return; }

    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user || user.id !== deal.advertiser_id) {
      res.status(403).json({ error: 'Only the advertiser can cancel this deal' });
      return;
    }

    const cancellableStatuses = ['created', 'pending_admin', 'pending_approval', 'approved'];
    if (!cancellableStatuses.includes(deal.status)) {
      res.status(400).json({ error: 'This deal can no longer be cancelled' });
      return;
    }

    const updated = await transitionDeal(deal.id, deal.status as any, 'cancelled');
    res.json(updated);
  } catch (err) {
    console.error('[api] POST /deals/:id/cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel deal' });
  }
});
