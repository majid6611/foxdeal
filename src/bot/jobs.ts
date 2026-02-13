import { bot } from './index.js';
import { postToChannel, isMessageAlive } from './admin.js';
import { transitionDeal, refundEscrow } from '../escrow/transitions.js';
import { getDealById, getChannelById } from '../db/queries.js';
import { env } from '../config/env.js';
import { pool } from '../db/index.js';
import type { Deal } from '../shared/types.js';

// Track active monitoring intervals so we can clean up
const activeMonitors = new Map<number, NodeJS.Timeout>();

/**
 * Auto-post: When a deal reaches escrow_held, immediately post to channel.
 * Called after successful payment.
 */
export async function autoPostDeal(dealId: number): Promise<void> {
  const deal = await getDealById(dealId);
  if (!deal || deal.status !== 'escrow_held') {
    console.error(`[jobs] autoPostDeal: deal ${dealId} not in escrow_held state`);
    return;
  }

  const channel = await getChannelById(deal.channel_id);
  if (!channel) {
    console.error(`[jobs] autoPostDeal: channel ${deal.channel_id} not found`);
    await refundEscrow(dealId, 'escrow_held', deal.price);
    return;
  }

  // Attempt to post (retry up to 3 times with backoff)
  let messageId: number | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    messageId = await postToChannel(
      channel.telegram_channel_id,
      deal.ad_text,
      deal.ad_image_url,
    );
    if (messageId) break;
    if (attempt < 3) {
      await sleep(attempt * 2000); // 2s, 4s backoff
    }
  }

  if (!messageId) {
    // All retries failed — refund
    console.error(`[jobs] autoPostDeal: failed to post deal ${dealId} after 3 attempts, refunding`);
    await refundEscrow(dealId, 'escrow_held', deal.price);
    return;
  }

  // Transition to posted
  await transitionDeal(dealId, 'escrow_held', 'posted', {
    posted_message_id: String(messageId),
    posted_at: new Date(),
  });

  console.log(`[jobs] Deal ${dealId} posted to channel ${channel.username} (msg ${messageId})`);

  // Start continuous monitoring
  startMonitoring(dealId, env.POST_DURATION_MINUTES);
}

/**
 * Monitor a posted deal periodically until the full duration expires.
 * Checks every CHECK_INTERVAL. If post is deleted at any point → dispute → refund.
 * When full duration passes and post is still up → verified → completed.
 */
function startMonitoring(dealId: number, durationMinutes: number): void {
  const totalMs = durationMinutes * 60 * 1000;
  // Check interval: every 30s for short durations (demo), every 5 min for longer ones
  const checkIntervalMs = durationMinutes <= 5
    ? 30 * 1000       // 30 seconds for demo/short durations
    : 5 * 60 * 1000;  // 5 minutes for production durations

  const startTime = Date.now();

  console.log(`[jobs] Monitoring deal ${dealId} for ${durationMinutes} min (checking every ${Math.round(checkIntervalMs / 1000)}s)`);

  const interval = setInterval(async () => {
    try {
      const elapsed = Date.now() - startTime;
      const deal = await getDealById(dealId);

      // Deal no longer in posted state — stop monitoring
      if (!deal || deal.status !== 'posted') {
        console.log(`[jobs] Deal ${dealId} no longer posted, stopping monitor`);
        stopMonitoring(dealId);
        return;
      }

      if (!deal.posted_message_id) {
        stopMonitoring(dealId);
        return;
      }

      const channel = await getChannelById(deal.channel_id);
      if (!channel) {
        stopMonitoring(dealId);
        return;
      }

      const alive = await isMessageAlive(
        channel.telegram_channel_id,
        Number(deal.posted_message_id),
      );

      if (!alive) {
        // Post was deleted — dispute and refund immediately
        stopMonitoring(dealId);
        await transitionDeal(dealId, 'posted', 'disputed');
        await refundEscrow(dealId, 'disputed', deal.price);
        console.log(`[jobs] Deal ${dealId} disputed — post deleted at ${Math.round(elapsed / 1000)}s / ${durationMinutes * 60}s, refunded`);

        await notifyUser(deal.advertiser_id,
          `Your ad in @${channel.username} was deleted early (${formatTime(elapsed)} / ${formatTime(totalMs)}). You've been refunded.`);
        await notifyUser(channel.owner_id,
          `Ad in @${channel.username} (deal #${dealId}) was deleted before the ${durationMinutes} min timer expired. Payment was refunded to the advertiser.`);
        return;
      }

      // Duration complete — verify and release
      if (elapsed >= totalMs) {
        stopMonitoring(dealId);
        await transitionDeal(dealId, 'posted', 'verified', {
          verified_at: new Date(),
        });
        const { releaseEscrow } = await import('../escrow/transitions.js');
        await releaseEscrow(dealId, deal.price);
        console.log(`[jobs] Deal ${dealId} verified and completed after ${durationMinutes} min`);

        await notifyUser(deal.advertiser_id,
          `Your ad in @${channel.username} stayed live for the full ${durationMinutes} min. Payment of ${deal.price} Stars released!`);
        await notifyUser(channel.owner_id,
          `Ad verified in @${channel.username} (deal #${dealId}). ${deal.price} Stars have been released to you!`);
      } else {
        const remaining = Math.round((totalMs - elapsed) / 1000);
        console.log(`[jobs] Deal ${dealId} check OK — ${remaining}s remaining`);
      }
    } catch (err) {
      console.error(`[jobs] Monitor error for deal ${dealId}:`, (err as Error).message);
    }
  }, checkIntervalMs);

  activeMonitors.set(dealId, interval);
}

/**
 * Stop monitoring a deal.
 */
function stopMonitoring(dealId: number): void {
  const interval = activeMonitors.get(dealId);
  if (interval) {
    clearInterval(interval);
    activeMonitors.delete(dealId);
    console.log(`[jobs] Stopped monitoring deal ${dealId}`);
  }
}

/**
 * Send a DM notification to a user via the bot.
 */
async function notifyUser(userId: number, message: string): Promise<void> {
  try {
    const { rows } = await pool.query<{ telegram_id: string }>(
      'SELECT telegram_id FROM users WHERE id = $1',
      [userId],
    );
    if (rows[0]) {
      await bot.api.sendMessage(Number(rows[0].telegram_id), message);
    }
  } catch (err) {
    console.error(`[jobs] Failed to notify user ${userId}:`, (err as Error).message);
  }
}

/**
 * Notify a user by their DB user ID.
 * Exported for use in other modules.
 */
export { notifyUser };

/**
 * On startup, resume monitoring for any deals stuck in 'posted' state.
 */
export async function resumePostedDeals(): Promise<void> {
  const { rows } = await pool.query<Deal>(
    "SELECT * FROM deals WHERE status = 'posted'",
  );

  for (const deal of rows) {
    if (!deal.posted_at) continue;

    const elapsed = Date.now() - new Date(deal.posted_at).getTime();
    const totalMs = env.POST_DURATION_MINUTES * 60 * 1000;

    if (elapsed >= totalMs) {
      // Duration already passed while we were down — verify immediately
      console.log(`[jobs] Deal ${deal.id} duration already passed, verifying now`);
      try {
        const channel = await getChannelById(deal.channel_id);
        if (!channel || !deal.posted_message_id) continue;

        const alive = await isMessageAlive(
          channel.telegram_channel_id,
          Number(deal.posted_message_id),
        );

        if (alive) {
          await transitionDeal(deal.id, 'posted', 'verified', { verified_at: new Date() });
          const { releaseEscrow } = await import('../escrow/transitions.js');
          await releaseEscrow(deal.id, deal.price);
          console.log(`[jobs] Deal ${deal.id} verified on resume`);
        } else {
          await transitionDeal(deal.id, 'posted', 'disputed');
          await refundEscrow(deal.id, 'disputed', deal.price);
          console.log(`[jobs] Deal ${deal.id} disputed on resume — post deleted`);
        }
      } catch (err) {
        console.error(`[jobs] Resume error for deal ${deal.id}:`, (err as Error).message);
      }
    } else {
      // Still within duration — resume monitoring with remaining time
      const remainingMinutes = (totalMs - elapsed) / 60000;
      console.log(`[jobs] Resuming monitoring for deal ${deal.id} (${Math.round(remainingMinutes * 10) / 10} min remaining)`);
      startMonitoring(deal.id, remainingMinutes);
    }
  }

  if (rows.length > 0) {
    console.log(`[jobs] Resumed ${rows.length} posted deal(s)`);
  }
}

function formatTime(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hrs = Math.floor(min / 60);
  const remainMin = min % 60;
  return remainMin > 0 ? `${hrs}h ${remainMin}m` : `${hrs}h`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
