import { bot } from './index.js';
import { pool } from '../db/index.js';
import { getChannelById } from '../db/queries.js';
import type { Deal } from '../shared/types.js';

/**
 * Get a user's Telegram ID from their DB user ID.
 */
async function getTelegramId(userId: number): Promise<number | null> {
  const { rows } = await pool.query<{ telegram_id: string }>(
    'SELECT telegram_id FROM users WHERE id = $1',
    [userId],
  );
  return rows[0] ? Number(rows[0].telegram_id) : null;
}

/**
 * Send a DM to a user by their DB user ID.
 */
async function sendDM(userId: number, message: string): Promise<void> {
  const telegramId = await getTelegramId(userId);
  if (!telegramId) return;

  try {
    await bot.api.sendMessage(telegramId, message, { parse_mode: 'HTML' });
  } catch (err) {
    console.error(`[notify] Failed to DM user ${userId}:`, (err as Error).message);
  }
}

/**
 * Notify channel owner of a new incoming deal.
 */
export async function notifyOwnerNewDeal(deal: Deal): Promise<void> {
  const channel = await getChannelById(deal.channel_id);
  if (!channel) return;

  await sendDM(
    channel.owner_id,
    `<b>New ad request!</b>\n\n` +
    `Channel: @${channel.username}\n` +
    `Price: ${deal.price} TON\n\n` +
    `<i>Ad copy:</i>\n${escapeHtml(deal.ad_text)}\n\n` +
    `Open the Mini App to approve or reject.`,
  );
}

/**
 * Notify advertiser their deal was approved.
 */
export async function notifyAdvertiserApproved(deal: Deal): Promise<void> {
  const channel = await getChannelById(deal.channel_id);
  if (!channel) return;

  await sendDM(
    deal.advertiser_id,
    `<b>Deal approved!</b>\n\n` +
    `Your ad for @${channel.username} was approved.\n` +
    `Pay ${deal.price} TON in Fox Deal to proceed.`,
  );
}

/**
 * Notify advertiser their deal was rejected.
 */
export async function notifyAdvertiserRejected(deal: Deal): Promise<void> {
  const channel = await getChannelById(deal.channel_id);
  if (!channel) return;

  const reason = deal.rejection_reason ? `\nReason: ${deal.rejection_reason}` : '';

  await sendDM(
    deal.advertiser_id,
    `<b>Deal rejected</b>\n\n` +
    `Your ad for @${channel.username} was rejected.${reason}`,
  );
}

/**
 * Notify advertiser deal is completed and payment released.
 */
export async function notifyAdvertiserCompleted(deal: Deal): Promise<void> {
  const channel = await getChannelById(deal.channel_id);
  if (!channel) return;

  await sendDM(
    deal.advertiser_id,
    `<b>Ad verified!</b>\n\n` +
    `Your ad in @${channel.username} stayed live for the full duration. Payment of ${deal.price} TON has been released to the channel owner.`,
  );
}

/**
 * Notify owner that payment was released.
 */
export async function notifyOwnerPaymentReleased(deal: Deal): Promise<void> {
  const channel = await getChannelById(deal.channel_id);
  if (!channel) return;

  await sendDM(
    channel.owner_id,
    `<b>Payment received!</b>\n\n` +
    `The ad in @${channel.username} has been verified. ${deal.price} TON have been released to you.`,
  );
}

/**
 * Notify advertiser of refund.
 */
export async function notifyAdvertiserRefunded(deal: Deal, reason: string): Promise<void> {
  await sendDM(
    deal.advertiser_id,
    `<b>Refund issued</b>\n\n` +
    `${deal.price} TON have been refunded.\nReason: ${reason}`,
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
