import { Router } from 'express';
import { z } from 'zod';
import { telegramAuth } from '../middleware/auth.js';
import {
  createChannel,
  getActiveChannels,
  getChannelById,
  getChannelsByOwner,
  updateChannelBotAdmin,
  updateChannelPhoto,
  deactivateChannel,
  activateChannel,
} from '../../db/queries.js';
import { upsertUser, getUserByTelegramId } from '../../db/queries.js';
import { isBotAdminOfChannel, getChannelInfo } from '../../bot/admin.js';
import { sendChannelForApproval } from '../../bot/adminChannel.js';

export const channelsRouter = Router();

// All channel routes require Telegram auth
channelsRouter.use(telegramAuth);

const createChannelSchema = z.object({
  telegramChannelId: z.string().min(1),
  category: z.string().min(1).max(50),
  price: z.number().int().positive(),
  durationHours: z.number().int().positive().default(24),
  cpcPrice: z.number().min(0).default(0),
});

// GET /api/channels — browse active channels (catalog)
channelsRouter.get('/', async (_req, res) => {
  try {
    const channels = await getActiveChannels();

    // Backfill missing photos
    await Promise.all(
      channels.map(async (ch) => {
        if (!ch.photo_url) {
          try {
            const info = await getChannelInfo(ch.telegram_channel_id);
            if (info?.photoUrl) {
              await updateChannelPhoto(ch.id, info.photoUrl);
              ch.photo_url = info.photoUrl;
            }
          } catch {}
        }
      }),
    );

    res.json(channels);
  } catch (err) {
    console.error('[api] GET /channels error:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// GET /api/channels/mine — channels owned by current user
channelsRouter.get('/mine', async (req, res) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.json([]);
      return;
    }
    const channels = await getChannelsByOwner(user.id);
    res.json(channels);
  } catch (err) {
    console.error('[api] GET /channels/mine error:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// GET /api/channels/:id — single channel detail
channelsRouter.get('/:id', async (req, res) => {
  try {
    const channel = await getChannelById(Number(req.params.id));
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    res.json(channel);
  } catch (err) {
    console.error('[api] GET /channels/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

// POST /api/channels — list a new channel (owner)
channelsRouter.post('/', async (req, res) => {
  try {
    const body = createChannelSchema.parse(req.body);

    // Verify bot is admin of the channel
    const isAdmin = await isBotAdminOfChannel(body.telegramChannelId);
    if (!isAdmin) {
      res.status(400).json({
        error: 'Bot is not an admin of this channel. Please add the bot as an admin first.',
      });
      return;
    }

    // Get channel info from Telegram
    const info = await getChannelInfo(body.telegramChannelId);
    if (!info) {
      res.status(400).json({ error: 'Could not retrieve channel info from Telegram' });
      return;
    }

    // Upsert user as owner
    const user = await upsertUser(req.telegramUser!.id, 'owner');

    // Create channel
    const channel = await createChannel(
      user.id,
      body.telegramChannelId,
      info.username ?? info.title,
      info.memberCount,
      body.category,
      body.price,
      body.durationHours,
      body.cpcPrice,
      info.photoUrl,
    );

    await updateChannelBotAdmin(channel.id, true);

    // Demo mode: auto-approve channel immediately
    // TODO: restore admin approval after demo — use sendChannelForApproval instead
    const { approveChannel } = await import('../../db/queries.js');
    await approveChannel(channel.id);

    res.status(201).json({ ...channel, approval_status: 'approved' as const });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('[api] POST /channels error:', err);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// POST /api/channels/:id/activate — reactivate channel (owner only)
channelsRouter.post('/:id/activate', async (req, res) => {
  try {
    const channel = await getChannelById(Number(req.params.id));
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user || user.id !== channel.owner_id) {
      res.status(403).json({ error: 'Not the owner of this channel' });
      return;
    }

    // Verify bot is still admin before reactivating
    const isAdmin = await isBotAdminOfChannel(channel.telegram_channel_id);
    if (!isAdmin) {
      res.status(400).json({
        error: 'Bot is no longer an admin of this channel. Please add the bot as admin first.',
      });
      return;
    }

    await activateChannel(channel.id);
    await updateChannelBotAdmin(channel.id, true);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] POST /channels/:id/activate error:', err);
    res.status(500).json({ error: 'Failed to activate channel' });
  }
});

// DELETE /api/channels/:id — deactivate channel (owner only)
channelsRouter.delete('/:id', async (req, res) => {
  try {
    const channel = await getChannelById(Number(req.params.id));
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user || user.id !== channel.owner_id) {
      res.status(403).json({ error: 'Not the owner of this channel' });
      return;
    }

    await deactivateChannel(channel.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /channels/:id error:', err);
    res.status(500).json({ error: 'Failed to deactivate channel' });
  }
});
