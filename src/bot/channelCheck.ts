import { pool } from '../db/index.js';
import { isBotAdminOfChannel } from './admin.js';
import { deactivateChannel } from '../db/queries.js';
import type { Channel } from '../shared/types.js';

/**
 * Periodically verify bot is still admin of all active channels.
 * If bot was removed, deactivate the channel and refund any in-progress deals.
 */
async function checkActiveChannels(): Promise<void> {
  const { rows: channels } = await pool.query<Channel>(
    "SELECT * FROM channels WHERE is_active = TRUE AND bot_is_admin = TRUE",
  );

  for (const channel of channels) {
    const isAdmin = await isBotAdminOfChannel(channel.telegram_channel_id);

    if (!isAdmin) {
      console.warn(`[channelCheck] Bot removed from channel @${channel.username} (id: ${channel.id})`);
      await deactivateChannel(channel.id);

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
    }
  }
}

/**
 * Start channel check job. Runs every 10 minutes.
 */
export function startChannelCheckJob(): void {
  const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  setInterval(() => {
    checkActiveChannels().catch((err) =>
      console.error('[channelCheck] Error:', err),
    );
  }, INTERVAL_MS);

  console.log('[channelCheck] Channel check job started (every 10 minutes)');
}
