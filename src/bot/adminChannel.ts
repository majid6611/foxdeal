import { bot } from './index.js';
import { env } from '../config/env.js';
import { approveChannel, rejectChannel, getChannelById, getDealById } from '../db/queries.js';
import { transitionDeal } from '../escrow/transitions.js';
import { notifyOwnerNewDeal, notifyAdvertiserRejected } from './notifications.js';
import type { Channel, Deal } from '../shared/types.js';

// ── Helper: get a user's Telegram ID from DB user ID ─────────────────

async function getTelegramId(userId: number): Promise<number | null> {
  const { pool } = await import('../db/index.js');
  const { rows } = await pool.query<{ telegram_id: string }>(
    'SELECT telegram_id FROM users WHERE id = $1',
    [userId],
  );
  return rows[0] ? Number(rows[0].telegram_id) : null;
}

// ── Channel Approval ─────────────────────────────────────────────────

/**
 * Send a channel listing to the admin channel for approval.
 */
export async function sendChannelForApproval(
  channel: Channel,
  displayName: string,
  memberCount: number,
): Promise<void> {
  const text =
    `<b>🦊 New Channel Listing</b>\n\n` +
    `<b>Channel:</b> @${displayName}\n` +
    `<b>Category:</b> ${channel.category}\n` +
    `<b>Subscribers:</b> ${memberCount.toLocaleString()}\n` +
    `<b>Time Price:</b> ${channel.price} Stars / ${channel.duration_hours}h\n` +
    (channel.cpc_price > 0 ? `<b>CPC Price:</b> ${channel.cpc_price} Stars/click\n` : '') +
    `\n<b>Channel ID:</b> <code>${channel.telegram_channel_id}</code>\n` +
    `<b>DB ID:</b> #${channel.id}`;

  await bot.api.sendMessage(env.ADMIN_CHANNEL_ID, text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `ch_approve:${channel.id}` },
          { text: '❌ Reject', callback_data: `ch_reject:${channel.id}` },
        ],
      ],
    },
  });
}

// ── Deal (Ad) Review ─────────────────────────────────────────────────

/**
 * Send a new ad/deal to the admin channel for review.
 * Admin approves → deal moves to pending_approval (channel owner sees it).
 * Admin rejects → deal is rejected, advertiser gets a DM.
 */
export async function sendDealForAdminReview(deal: Deal): Promise<void> {
  const channel = await getChannelById(deal.channel_id);
  const channelName = channel ? `@${channel.username}` : `Channel #${deal.channel_id}`;

  const pricingInfo = deal.pricing_model === 'cpc'
    ? `<b>Pricing:</b> CPC (${deal.budget} Stars budget)`
    : `<b>Pricing:</b> Time-based (${deal.price} Stars / ${deal.duration_hours}h)`;

  let text =
    `<b>📢 New Ad Submission</b>\n\n` +
    `<b>Target Channel:</b> ${channelName}\n` +
    `${pricingInfo}\n` +
    `<b>Deal ID:</b> #${deal.id}\n\n` +
    `<b>Ad Copy:</b>\n${escapeHtml(deal.ad_text)}`;

  if (deal.ad_link) {
    text += `\n\n<b>Link:</b> ${escapeHtml(deal.ad_link)}`;
  }

  // If ad has an image, send as photo with caption; otherwise send as text
  if (deal.ad_image_url) {
    const fullUrl = resolveImageUrl(deal.ad_image_url);
    try {
      await bot.api.sendPhoto(env.ADMIN_CHANNEL_ID, fullUrl, {
        caption: text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve Ad', callback_data: `ad_approve:${deal.id}` },
              { text: '❌ Reject Ad', callback_data: `ad_reject:${deal.id}` },
            ],
          ],
        },
      });
      return;
    } catch {
      // Fall through to text-only if photo fails
    }
  }

  await bot.api.sendMessage(env.ADMIN_CHANNEL_ID, text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve Ad', callback_data: `ad_approve:${deal.id}` },
          { text: '❌ Reject Ad', callback_data: `ad_reject:${deal.id}` },
        ],
      ],
    },
  });
}

// ── Callback Handlers ────────────────────────────────────────────────

/**
 * Register all admin channel callback handlers (channels + deals).
 * Should be called once during bot startup.
 */
export function registerAdminChannelHandlers(): void {
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    // ── Channel approval ──
    if (data.startsWith('ch_approve:') || data.startsWith('ch_reject:')) {
      await handleChannelCallback(ctx, data);
      return;
    }

    // ── Deal (ad) approval ──
    if (data.startsWith('ad_approve:') || data.startsWith('ad_reject:')) {
      await handleDealCallback(ctx, data);
      return;
    }
  });

  console.log('[bot] Admin channel handlers registered (channels + deals)');
}

// ── Channel callback handler ─────────────────────────────────────────

async function handleChannelCallback(ctx: any, data: string): Promise<void> {
  const [action, channelIdStr] = data.split(':');
  const channelId = Number(channelIdStr);

  if (!channelId || isNaN(channelId)) {
    await ctx.answerCallbackQuery({ text: 'Invalid channel ID' });
    return;
  }

  try {
    const channel = await getChannelById(channelId);
    if (!channel) {
      await ctx.answerCallbackQuery({ text: 'Channel not found' });
      return;
    }

    if (channel.approval_status !== 'pending') {
      await ctx.answerCallbackQuery({ text: `Channel already ${channel.approval_status}` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    if (action === 'ch_approve') {
      await approveChannel(channelId);
      await ctx.answerCallbackQuery({ text: '✅ Channel approved!' });

      const originalText = ctx.callbackQuery.message?.text ?? '';
      await ctx.editMessageText(originalText + '\n\n✅ <b>APPROVED</b>', { parse_mode: 'HTML' }).catch(() => {});

      // Notify channel owner
      const telegramId = await getTelegramId(channel.owner_id);
      if (telegramId) {
        await bot.api.sendMessage(
          telegramId,
          `<b>✅ Channel approved!</b>\n\nYour channel @${channel.username} has been approved and is now live in the Fox Deal catalog.`,
          { parse_mode: 'HTML' },
        ).catch(() => {});
      }
    } else if (action === 'ch_reject') {
      await rejectChannel(channelId);
      await ctx.answerCallbackQuery({ text: '❌ Channel rejected' });

      const originalText = ctx.callbackQuery.message?.text ?? '';
      await ctx.editMessageText(originalText + '\n\n❌ <b>REJECTED</b>', { parse_mode: 'HTML' }).catch(() => {});

      // Notify channel owner
      const telegramId = await getTelegramId(channel.owner_id);
      if (telegramId) {
        await bot.api.sendMessage(
          telegramId,
          `<b>❌ Channel not approved</b>\n\nYour channel @${channel.username} was not approved for the Fox Deal catalog. Please contact support for more details.`,
          { parse_mode: 'HTML' },
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[admin] Channel callback error:', err);
    await ctx.answerCallbackQuery({ text: 'Error processing action' });
  }
}

// ── Deal callback handler ────────────────────────────────────────────

async function handleDealCallback(ctx: any, data: string): Promise<void> {
  const [action, dealIdStr] = data.split(':');
  const dealId = Number(dealIdStr);

  if (!dealId || isNaN(dealId)) {
    await ctx.answerCallbackQuery({ text: 'Invalid deal ID' });
    return;
  }

  try {
    const deal = await getDealById(dealId);
    if (!deal) {
      await ctx.answerCallbackQuery({ text: 'Deal not found' });
      return;
    }

    if (deal.status !== 'pending_admin') {
      await ctx.answerCallbackQuery({ text: `Deal already ${deal.status}` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    if (action === 'ad_approve') {
      // Transition: pending_admin → pending_approval (now channel owner can see it)
      const updated = await transitionDeal(dealId, 'pending_admin', 'pending_approval');

      await ctx.answerCallbackQuery({ text: '✅ Ad approved! Sent to channel owner.' });

      // Update admin message
      const originalText = ctx.callbackQuery.message?.text ?? ctx.callbackQuery.message?.caption ?? '';
      if (ctx.callbackQuery.message?.photo) {
        await ctx.editMessageCaption({
          caption: originalText + '\n\n✅ <b>APPROVED</b> — sent to channel owner',
          parse_mode: 'HTML',
        }).catch(() => {});
      } else {
        await ctx.editMessageText(originalText + '\n\n✅ <b>APPROVED</b> — sent to channel owner', {
          parse_mode: 'HTML',
        }).catch(() => {});
      }

      // Now notify the channel owner about the new deal
      notifyOwnerNewDeal(updated).catch((e) =>
        console.error('[admin] Failed to notify owner:', e),
      );
    } else if (action === 'ad_reject') {
      // Transition: pending_admin → rejected
      const updated = await transitionDeal(dealId, 'pending_admin', 'rejected', {
        rejection_reason: 'Ad not approved by moderators',
      });

      await ctx.answerCallbackQuery({ text: '❌ Ad rejected' });

      // Update admin message
      const originalText = ctx.callbackQuery.message?.text ?? ctx.callbackQuery.message?.caption ?? '';
      if (ctx.callbackQuery.message?.photo) {
        await ctx.editMessageCaption({
          caption: originalText + '\n\n❌ <b>REJECTED</b>',
          parse_mode: 'HTML',
        }).catch(() => {});
      } else {
        await ctx.editMessageText(originalText + '\n\n❌ <b>REJECTED</b>', {
          parse_mode: 'HTML',
        }).catch(() => {});
      }

      // Notify advertiser their ad was rejected
      notifyAdvertiserRejected(updated).catch((e) =>
        console.error('[admin] Failed to notify advertiser:', e),
      );
    }
  } catch (err) {
    console.error('[admin] Deal callback error:', err);
    await ctx.answerCallbackQuery({ text: 'Error processing action' });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

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
