import { Router } from 'express';
import { z } from 'zod';
import { telegramAuth } from '../middleware/auth.js';
import {
  createCampaign,
  createCampaignItem,
  createDeal,
  deleteCampaign,
  deleteCampaignItem,
  getCampaignByIdForAdvertiser,
  getCampaignDealIds,
  getCampaignItemByIdForAdvertiser,
  getCampaignItems,
  getCampaignsByAdvertiser,
  getChannelById,
  getDealById,
  getUserByTelegramId,
  upsertUser,
  updateCampaignStatus,
} from '../../db/queries.js';
import { transitionDeal } from '../../escrow/transitions.js';
import { notifyOwnerNewDeal } from '../../bot/notifications.js';
import type { DealStatus } from '../../shared/types.js';
import { holdEscrow } from '../../escrow/transitions.js';
import { autoPostDeal } from '../../bot/jobs.js';

export const campaignsRouter = Router();

campaignsRouter.use(telegramAuth);

const createCampaignSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  ad_text: z.string().min(1).max(4096),
  ad_image_url: z.string().min(1).nullable().optional(),
  ad_link: z.string().trim().min(1).nullable().optional(),
  button_text: z.string().min(2).max(24).optional(),
  channel_ids: z.array(z.number().int().positive()).min(1),
  schedule_at: z.string().optional(),
});

function isCancellableDealStatus(status: string): boolean {
  return ['created', 'pending_admin', 'pending_approval'].includes(status);
}

function isDeletableCampaignDealStatus(status: string): boolean {
  return !['escrow_held', 'posted', 'verified', 'completed'].includes(status);
}

function normalizeCampaignAdLink(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  if (raw.startsWith('@')) {
    const username = raw.slice(1);
    if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
      throw new Error('Invalid Telegram username in ad_link');
    }
    return `https://t.me/${username}`;
  }

  if (/^t\.me\/[A-Za-z0-9_]{5,32}$/i.test(raw)) {
    return `https://${raw}`;
  }

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    return parsed.toString();
  } catch {
    throw new Error('Invalid ad_link');
  }
}

// POST /api/campaigns
campaignsRouter.post('/campaigns', async (req, res) => {
  try {
    const body = createCampaignSchema.parse(req.body);
    const adLink = normalizeCampaignAdLink(body.ad_link);
    const user = await upsertUser(req.telegramUser!.id, 'advertiser');

    const uniqueChannelIds = Array.from(new Set(body.channel_ids));
    const channels = await Promise.all(uniqueChannelIds.map((channelId) => getChannelById(channelId)));

    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      const channelId = uniqueChannelIds[i];
      if (!channel || !channel.is_active || channel.approval_status !== 'approved') {
        res.status(400).json({ error: `Channel ${channelId} not found or inactive` });
        return;
      }
    }

    const campaign = await createCampaign(
      user.id,
      body.title ?? null,
      body.ad_text,
      body.ad_image_url ?? null,
      adLink,
      body.button_text ?? '🔗 Learn More',
    );

    for (const channel of channels) {
      if (!channel) continue;

      const deal = await createDeal(
        user.id,
        channel.id,
        body.ad_text,
        body.ad_image_url ?? null,
        adLink,
        channel.duration_hours,
        channel.price,
        'time',
        0,
        body.button_text ?? '🔗 Learn More',
      );

      const submittedDeal = await transitionDeal(deal.id, 'created', 'pending_approval');
      await createCampaignItem(campaign.id, channel.id, submittedDeal.id, submittedDeal.status);
      notifyOwnerNewDeal(submittedDeal).catch((e) =>
        console.error('[api] campaign notify owner error:', e),
      );
    }

    const items = await getCampaignItems(campaign.id);
    res.status(201).json({ campaign, items });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('[api] POST /campaigns error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// GET /api/campaigns
campaignsRouter.get('/campaigns', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.json([]);
      return;
    }
    const campaigns = await getCampaignsByAdvertiser(user.id);
    res.json(campaigns);
  } catch (err) {
    console.error('[api] GET /campaigns error:', err);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// GET /api/campaigns/:id
campaignsRouter.get('/campaigns/:id', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const campaignId = Number(req.params.id);
    const campaign = await getCampaignByIdForAdvertiser(campaignId, user.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const items = await getCampaignItems(campaign.id);
    res.json({ campaign, items });
  } catch (err) {
    console.error('[api] GET /campaigns/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// POST /api/campaigns/:id/submit
campaignsRouter.post('/campaigns/:id/submit', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const campaignId = Number(req.params.id);
    const campaign = await getCampaignByIdForAdvertiser(campaignId, user.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Current implementation submits items immediately on create; submit is no-op.
    const items = await getCampaignItems(campaign.id);
    res.json({ campaign, items, submitted: true });
  } catch (err) {
    console.error('[api] POST /campaigns/:id/submit error:', err);
    res.status(500).json({ error: 'Failed to submit campaign' });
  }
});

// POST /api/campaign_items/:id/remove
campaignsRouter.post('/campaign_items/:id/remove', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const itemId = Number(req.params.id);
    const item = await getCampaignItemByIdForAdvertiser(itemId, user.id);
    if (!item) {
      res.status(404).json({ error: 'Campaign item not found' });
      return;
    }

    if (item.deal_id) {
      const deal = await getDealById(item.deal_id);
      if (!deal) {
        res.status(404).json({ error: 'Related deal not found' });
        return;
      }
      if (!isCancellableDealStatus(deal.status)) {
        res.status(400).json({ error: 'Item cannot be removed after approval/payment' });
        return;
      }
      await transitionDeal(deal.id, deal.status as DealStatus, 'cancelled');
    }

    await deleteCampaignItem(item.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] POST /campaign_items/:id/remove error:', err);
    res.status(500).json({ error: 'Failed to remove campaign item' });
  }
});

// POST /api/campaigns/:id/cancel
campaignsRouter.post('/campaigns/:id/cancel', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const campaignId = Number(req.params.id);
    const campaign = await getCampaignByIdForAdvertiser(campaignId, user.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const dealIds = await getCampaignDealIds(campaign.id);
    for (const dealId of dealIds) {
      const deal = await getDealById(dealId);
      if (!deal) continue;
      if (!isCancellableDealStatus(deal.status)) continue;
      await transitionDeal(deal.id, deal.status as DealStatus, 'cancelled');
    }

    const updated = await updateCampaignStatus(campaign.id, 'cancelled');
    const items = await getCampaignItems(campaign.id);
    res.json({ campaign: updated ?? campaign, items });
  } catch (err) {
    console.error('[api] POST /campaigns/:id/cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel campaign' });
  }
});

// POST /api/campaigns/:id/delete
campaignsRouter.post('/campaigns/:id/delete', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const campaignId = Number(req.params.id);
    const campaign = await getCampaignByIdForAdvertiser(campaignId, user.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const dealIds = await getCampaignDealIds(campaign.id);
    for (const dealId of dealIds) {
      const deal = await getDealById(dealId);
      if (!deal) continue;
      if (!isDeletableCampaignDealStatus(deal.status)) {
        res.status(400).json({
          error: 'Campaign cannot be deleted because one or more items are already paid or ongoing',
        });
        return;
      }
    }

    for (const dealId of dealIds) {
      const deal = await getDealById(dealId);
      if (!deal) continue;
      if (deal.status === 'approved' || isCancellableDealStatus(deal.status)) {
        await transitionDeal(deal.id, deal.status as DealStatus, 'cancelled');
      }
    }

    await deleteCampaign(campaign.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] POST /campaigns/:id/delete error:', err);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// POST /api/campaigns/:id/pay-all-approved
campaignsRouter.post('/campaigns/:id/pay-all-approved', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const campaignId = Number(req.params.id);
    const campaign = await getCampaignByIdForAdvertiser(campaignId, user.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const dealIds = await getCampaignDealIds(campaign.id);
    let approvedCount = 0;
    let paidNow = 0;
    const skipped: number[] = [];
    const failed: Array<{ dealId: number; reason: string }> = [];

    for (const dealId of dealIds) {
      const deal = await getDealById(dealId);
      if (!deal) {
        skipped.push(dealId);
        continue;
      }
      if (deal.advertiser_id !== user.id) {
        skipped.push(dealId);
        continue;
      }
      if (deal.status !== 'approved') {
        skipped.push(dealId);
        continue;
      }

      approvedCount += 1;

      try {
        await holdEscrow(deal.id, deal.price);
        paidNow += 1;
        autoPostDeal(deal.id).catch((err) =>
          console.error(`[campaigns] Error auto-posting deal ${deal.id}:`, err),
        );
      } catch (err) {
        failed.push({ dealId: deal.id, reason: (err as Error).message });
      }
    }

    if (approvedCount === 0) {
      res.status(400).json({ error: 'No approved items found to pay' });
      return;
    }

    const items = await getCampaignItems(campaign.id);
    res.json({
      success: failed.length === 0,
      campaign,
      items,
      summary: {
        approvedCount,
        paidNow,
        skippedCount: skipped.length,
        failedCount: failed.length,
      },
      failed,
    });
  } catch (err) {
    console.error('[api] POST /campaigns/:id/pay-all-approved error:', err);
    res.status(500).json({ error: 'Failed to pay approved campaign items' });
  }
});
