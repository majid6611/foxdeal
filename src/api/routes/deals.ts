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

export const dealsRouter = Router();

dealsRouter.use(telegramAuth);

const createDealSchema = z.object({
  channelId: z.number().int().positive(),
  adText: z.string().min(1).max(4096),
  adImageUrl: z.string().min(1).nullable().optional(),
});

// GET /api/deals — deals for current user (as advertiser)
dealsRouter.get('/', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.json([]);
      return;
    }
    const deals = await getDealsByAdvertiser(user.id);
    res.json(deals);
  } catch (err) {
    console.error('[api] GET /deals error:', err);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/incoming — incoming deals for owner's channels
dealsRouter.get('/incoming', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.json([]);
      return;
    }
    const deals = await getIncomingDealsForOwner(user.id);
    res.json(deals);
  } catch (err) {
    console.error('[api] GET /deals/incoming error:', err);
    res.status(500).json({ error: 'Failed to fetch incoming deals' });
  }
});

// GET /api/deals/:id — single deal detail
dealsRouter.get('/:id', async (req, res) => {
  try {
    const deal = await getDealById(Number(req.params.id));
    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }
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

    // Verify channel exists and is active
    const channel = await getChannelById(body.channelId);
    if (!channel || !channel.is_active) {
      res.status(400).json({ error: 'Channel not found or inactive' });
      return;
    }

    // Upsert user as advertiser
    const user = await upsertUser(req.telegramUser!.id, 'advertiser');

    // Create deal
    const deal = await createDeal(
      user.id,
      body.channelId,
      body.adText,
      body.adImageUrl ?? null,
      channel.duration_hours,
      channel.price,
    );

    // Immediately transition to pending_approval
    const updated = await transitionDeal(deal.id, 'created', 'pending_approval');

    // Notify channel owner
    notifyOwnerNewDeal(updated).catch((e) =>
      console.error('[api] notify owner error:', e),
    );

    res.status(201).json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    // Check for duplicate deal constraint
    if ((err as any)?.constraint === 'idx_deals_active_unique') {
      res.status(409).json({ error: 'You already have an active deal for this channel. Cancel or wait for it to complete before creating a new one.' });
      return;
    }
    console.error('[api] POST /deals error:', err);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// POST /api/deals/:id/approve — owner approves a deal
dealsRouter.post('/:id/approve', async (req, res) => {
  try {
    const deal = await getDealById(Number(req.params.id));
    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    // Verify the current user is the channel owner
    const channel = await getChannelById(deal.channel_id);
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!channel || !user || channel.owner_id !== user.id) {
      res.status(403).json({ error: 'Only the channel owner can approve deals' });
      return;
    }

    const updated = await transitionDeal(deal.id, 'pending_approval', 'approved');

    // Notify advertiser
    notifyAdvertiserApproved(updated).catch((e) =>
      console.error('[api] notify advertiser approved error:', e),
    );

    res.json(updated);
  } catch (err) {
    console.error('[api] POST /deals/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve deal' });
  }
});

// POST /api/deals/:id/reject — owner rejects a deal
dealsRouter.post('/:id/reject', async (req, res) => {
  try {
    const reasonSchema = z.object({
      reason: z.string().min(1).max(500).optional(),
    });
    const { reason } = reasonSchema.parse(req.body);

    const deal = await getDealById(Number(req.params.id));
    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    // Verify the current user is the channel owner
    const channel = await getChannelById(deal.channel_id);
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!channel || !user || channel.owner_id !== user.id) {
      res.status(403).json({ error: 'Only the channel owner can reject deals' });
      return;
    }

    const updated = await transitionDeal(deal.id, 'pending_approval', 'rejected', {
      rejection_reason: reason ?? null,
    });

    // Notify advertiser
    notifyAdvertiserRejected(updated).catch((e) =>
      console.error('[api] notify advertiser rejected error:', e),
    );

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

// POST /api/deals/:id/cancel — advertiser cancels a deal (before payment)
dealsRouter.post('/:id/cancel', async (req, res) => {
  try {
    const deal = await getDealById(Number(req.params.id));
    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    // Only the advertiser can cancel
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user || user.id !== deal.advertiser_id) {
      res.status(403).json({ error: 'Only the advertiser can cancel this deal' });
      return;
    }

    // Can only cancel before payment (created, pending_approval, approved)
    const cancellableStatuses = ['created', 'pending_approval', 'approved'];
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
