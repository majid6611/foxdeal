import { pool } from '../db/index.js';
import { checkBotAdminStatus, getChannelInfo } from './admin.js';
import { deactivateChannel, updateChannelBotAdmin, updateChannelSnapshot } from '../db/queries.js';
import type { Channel } from '../shared/types.js';

/**
 * Periodically verify bot is still admin of all active channels.
 * If bot was removed, deactivate the channel and refund any in-progress deals.
 */
async function checkActiveChannels(): Promise<void> {
  const { rows: channels } = await pool.query<Channel>(
    'SELECT * FROM channels WHERE is_active = TRUE',
  );

  for (const channel of channels) {
    const adminCheck = await confirmBotAdminStatus(channel.telegram_channel_id);

    if (adminCheck === 'unknown') {
      console.warn(`[channelCheck] Skipped deactivation check for @${channel.username}: transient admin-check failure`);
      continue;
    }

    if (adminCheck === 'not_admin') {
      console.warn(`[channelCheck] Bot removed from channel @${channel.username} (id: ${channel.id})`);
      await deactivateChannel(channel.id);
      await updateChannelBotAdmin(channel.id, false);

      // Refund any deals in escrow_held or posted state for this channel
      const { rows: activeDeals } = await pool.query(
        "SELECT * FROM deals WHERE channel_id = $1 AND status IN ('escrow_held', 'posted')",
        [channel.id],
      );

      for (const deal of activeDeals) {
        try {
          const { refundEscrow } = await import('../escrow/transitions.js');
          await refundEscrow(deal.id, deal.status as 'escrow_held' | 'disputed', deal.price);
          console.log(`[channelCheck] Refunded deal ${deal.id} (channel deactivated)`);
        } catch (err) {
          console.error(`[channelCheck] Failed to refund deal ${deal.id}:`, (err as Error).message);
        }
      }
      continue;
    }

    if (!channel.bot_is_admin) {
      await updateChannelBotAdmin(channel.id, true);
    }

    // Keep channel metadata fresh for catalog views.
    try {
      const info = await getChannelInfo(channel.telegram_channel_id);
      if (!info) continue;

      const nextSubscribers = info.memberCount;
      const nextPhotoUrl = info.photoUrl ?? null;
      const changed = channel.subscribers !== nextSubscribers || channel.photo_url !== nextPhotoUrl;

      if (changed) {
        await updateChannelSnapshot(channel.id, nextSubscribers, nextPhotoUrl);
        console.log(
          `[channelCheck] Updated @${channel.username} metadata: subscribers ${channel.subscribers} -> ${nextSubscribers}, photo ${channel.photo_url ? 'set' : 'none'} -> ${nextPhotoUrl ? 'set' : 'none'}`,
        );
      }
    } catch (err) {
      console.warn(`[channelCheck] Metadata refresh failed for @${channel.username}:`, (err as Error).message);
    }
  }
}

async function confirmBotAdminStatus(channelId: string | number): Promise<'admin' | 'not_admin' | 'unknown'> {
  const checks = [
    await checkBotAdminStatus(channelId),
    await checkBotAdminStatus(channelId),
  ];

  if (checks.some((c) => c.isAdmin)) {
    return 'admin';
  }

  if (checks.some((c) => !c.isDefinitive)) {
    const reasons = checks.map((c) => c.reason).join(' | ');
    console.warn(`[channelCheck] Admin check uncertain for ${channelId}: ${reasons}`);
    return 'unknown';
  }

  const reasons = checks.map((c) => c.reason).join(' | ');
  console.warn(`[channelCheck] Admin check confirmed not-admin for ${channelId}: ${reasons}`);
  return 'not_admin';
}

/**
 * Start channel check job. Runs every 10 minutes.
 */
export function startChannelCheckJob(): void {
  const INTERVAL_MS = 1 * 60 * 1000; // 1 minute (test)

  // Run once on startup so metadata is refreshed immediately.
  checkActiveChannels().catch((err) =>
    console.error('[channelCheck] Initial run error:', err),
  );

  setInterval(() => {
    checkActiveChannels().catch((err) =>
      console.error('[channelCheck] Error:', err),
    );
  }, INTERVAL_MS);

  console.log('[channelCheck] Channel check job started (every 1 minute)');
}
