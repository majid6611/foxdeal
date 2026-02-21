import { Router } from 'express';
import { z } from 'zod';
import { telegramAuth } from '../middleware/auth.js';
import {
  createChannel,
  getActiveChannels,
  getChannelById,
  getChannelsByOwner,
  getFavoriteChannelIds,
  getFavoriteChannelsByUser,
  addFavoriteChannel,
  removeFavoriteChannel,
  updateChannelBotAdmin,
  updateChannelPhoto,
  deactivateChannel,
  activateChannel,
  resubmitRejectedChannel,
  removeRejectedChannel,
  ensureUserByTelegramId,
  upsertUser,
  getUserByTelegramId,
} from '../../db/queries.js';
import { isBotAdminOfChannel, getChannelInfo, getChannelPublicStats } from '../../bot/admin.js';
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
const resubmitChannelSchema = z.object({
  category: z.string().min(1).max(50),
  price: z.number().int().positive(),
  durationHours: z.number().int().positive(),
  cpcPrice: z.number().min(0).default(0),
});

function isPgErrorWithCode(
  err: unknown,
): err is { code: string; constraint?: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

// GET /api/channels — browse active channels (catalog)
channelsRouter.get('/', async (req, res) => {
  try {
    const user = await ensureUserByTelegramId(req.telegramUser!.id, req.telegramUser?.username ?? null);
    const channels = await getActiveChannels();
    const favoriteIds = new Set(await getFavoriteChannelIds(user.id));

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

    res.json(channels.map((ch) => ({ ...ch, is_favorite: favoriteIds.has(ch.id) })));
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

// GET /api/channels/favorites — favorite channels for current user
channelsRouter.get('/favorites', async (req, res) => {
  try {
    const user = await ensureUserByTelegramId(req.telegramUser!.id, req.telegramUser?.username ?? null);
    const favorites = await getFavoriteChannelsByUser(user.id);
    res.json(favorites);
  } catch (err) {
    console.error('[api] GET /channels/favorites error:', err);
    res.status(500).json({ error: 'Failed to fetch favorite channels' });
  }
});

// POST /api/channels/:id/favorite — mark channel as favorite
channelsRouter.post('/:id/favorite', async (req, res) => {
  try {
    const channel = await getChannelById(Number(req.params.id));
    if (!channel || !channel.is_active || channel.approval_status !== 'approved') {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const user = await ensureUserByTelegramId(req.telegramUser!.id, req.telegramUser?.username ?? null);
    await addFavoriteChannel(user.id, channel.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] POST /channels/:id/favorite error:', err);
    res.status(500).json({ error: 'Failed to favorite channel' });
  }
});

// DELETE /api/channels/:id/favorite — remove channel from favorites
channelsRouter.delete('/:id/favorite', async (req, res) => {
  try {
    const user = await ensureUserByTelegramId(req.telegramUser!.id, req.telegramUser?.username ?? null);
    await removeFavoriteChannel(user.id, Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /channels/:id/favorite error:', err);
    res.status(500).json({ error: 'Failed to remove favorite channel' });
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
    console.log('[api] Telegram channel info:', {
      requestedChannelId: body.telegramChannelId,
      id: info.id,
      title: info.title,
      username: info.username ?? null,
      memberCount: info.memberCount,
      hasPhoto: Boolean(info.photoUrl),
    });

    // Upsert user as owner
    const user = await upsertUser(req.telegramUser!.id, 'owner');

    // Compute public stats for public channels (best-effort, non-blocking)
    const publicStats = info.username
      ? await getChannelPublicStats(info.username)
      : { avgPostViews: null, mostUsedLanguage: null };
    console.log('[api] Channel public stats:', {
      username: info.username ?? null,
      avgPostViews: publicStats.avgPostViews,
      mostUsedLanguage: publicStats.mostUsedLanguage,
    });

    // Create channel
    const channel = await createChannel(
      user.id,
      body.telegramChannelId,
      info.username ?? info.title,
      info.memberCount,
      publicStats.avgPostViews,
      publicStats.mostUsedLanguage,
      body.category,
      body.price,
      body.durationHours,
      body.cpcPrice,
      info.photoUrl,
    );

    await updateChannelBotAdmin(channel.id, true);

    // Send to admin moderation channel. Channel stays pending/inactive until approved.
    await sendChannelForApproval(channel, info.username ?? info.title, info.memberCount);

    res.status(201).json(channel);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    if (
      isPgErrorWithCode(err)
      && err.code === '23505'
      && err.constraint === 'channels_telegram_channel_id_key'
    ) {
      res.status(409).json({ error: 'This channel is already listed.' });
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

    if (channel.approval_status !== 'approved') {
      res.status(400).json({ error: 'Channel must be approved by admin before activation' });
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

// POST /api/channels/:id/resubmit — resubmit a rejected channel (owner only)
channelsRouter.post('/:id/resubmit', async (req, res) => {
  try {
    const body = resubmitChannelSchema.parse(req.body);
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

    if (channel.approval_status !== 'rejected') {
      res.status(400).json({ error: 'Only rejected channels can be resubmitted' });
      return;
    }

    const isAdmin = await isBotAdminOfChannel(channel.telegram_channel_id);
    if (!isAdmin) {
      res.status(400).json({
        error: 'Bot is not an admin of this channel. Please add the bot as an admin first.',
      });
      return;
    }

    const info = await getChannelInfo(channel.telegram_channel_id);
    if (!info) {
      res.status(400).json({ error: 'Could not retrieve channel info from Telegram' });
      return;
    }

    const publicStats = info.username
      ? await getChannelPublicStats(info.username)
      : { avgPostViews: null, mostUsedLanguage: null };

    const updated = await resubmitRejectedChannel(channel.id, user.id, {
      username: info.username ?? info.title,
      subscribers: info.memberCount,
      avgPostViews: publicStats.avgPostViews,
      mostUsedLanguage: publicStats.mostUsedLanguage,
      category: body.category,
      price: body.price,
      durationHours: body.durationHours,
      cpcPrice: body.cpcPrice,
      photoUrl: info.photoUrl,
    });
    if (!updated) {
      res.status(400).json({ error: 'Failed to resubmit channel' });
      return;
    }

    await updateChannelBotAdmin(updated.id, true);
    await sendChannelForApproval(updated, info.username ?? info.title, info.memberCount);
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('[api] POST /channels/:id/resubmit error:', err);
    res.status(500).json({ error: 'Failed to resubmit channel' });
  }
});

// POST /api/channels/:id/remove — permanently remove a rejected channel (owner only)
channelsRouter.post('/:id/remove', async (req, res) => {
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
    const removed = await removeRejectedChannel(channel.id, user.id);
    if (!removed) {
      res.status(400).json({ error: 'Only rejected channels can be removed' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[api] POST /channels/:id/remove error:', err);
    res.status(500).json({ error: 'Failed to remove channel' });
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
