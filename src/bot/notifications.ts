import { bot } from './index.js';
import { pool } from '../db/index.js';
import { getChannelById } from '../db/queries.js';
import { env } from '../config/env.js';
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

  const telegramId = await getTelegramId(channel.owner_id);
  if (!telegramId) return;

  const pricingInfo = deal.pricing_model === 'cpc'
    ? `CPC (${deal.budget} TON budget)`
    : `${deal.price} TON / ${deal.duration_hours}h`;

  const text =
    `<b>New ad request!</b>\n\n` +
    `<b>Channel:</b> @${escapeHtml(channel.username)}\n` +
    `<b>Deal ID:</b> #${deal.id}\n` +
    `<b>Pricing:</b> ${pricingInfo}\n\n` +
    `<b>Ad copy:</b>\n${escapeHtml(deal.ad_text)}` +
    (deal.ad_link ? `\n\n<b>Link:</b> ${escapeHtml(deal.ad_link)}` : '');

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `owner_ad_approve:${deal.id}` },
      { text: '❌ Reject', callback_data: `owner_ad_reject:${deal.id}` },
    ]],
  };

  try {
    if (deal.ad_image_url) {
      // Telegram photo captions are limited; trim while preserving the key details.
      const caption = text.length > 1000 ? `${text.slice(0, 997)}...` : text;
      await bot.api.sendPhoto(telegramId, resolveImageUrl(deal.ad_image_url), {
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
      return;
    }
  } catch (err) {
    console.warn('[notify] Failed to send ad image preview, falling back to text:', (err as Error).message);
  }

  await bot.api.sendMessage(telegramId, text, {
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
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
 * Ask advertiser to rate a completed deal (1-5 stars).
 */
export async function notifyAdvertiserRatingRequest(deal: Deal): Promise<void> {
  const channel = await getChannelById(deal.channel_id);
  if (!channel) return;

  const telegramId = await getTelegramId(deal.advertiser_id);
  if (!telegramId) return;

  try {
    await bot.api.sendMessage(
      telegramId,
      `<b>Rate your experience</b>\n\n` +
      `How was your ad campaign with @${escapeHtml(channel.username)}?\n` +
      `Please select a score from 1 to 5 stars.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '⭐ 1', callback_data: `rate:${deal.id}:1` },
            { text: '⭐ 2', callback_data: `rate:${deal.id}:2` },
            { text: '⭐ 3', callback_data: `rate:${deal.id}:3` },
            { text: '⭐ 4', callback_data: `rate:${deal.id}:4` },
            { text: '⭐ 5', callback_data: `rate:${deal.id}:5` },
          ]],
        },
      },
    );
  } catch (err) {
    console.error(`[notify] Failed to send rating request for deal ${deal.id}:`, (err as Error).message);
  }
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

function resolveImageUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const base = env.MINI_APP_URL.replace(/\/$/, '');
  return `${base}${url}`;
}
