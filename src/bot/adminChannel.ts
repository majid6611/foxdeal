import { bot } from './index.js';
import { InputFile } from 'grammy';
import { env } from '../config/env.js';
import {
  approveChannel,
  rejectChannel,
  getChannelById,
  getDealById,
  getUserByTelegramId,
  submitAdvertiserRating,
  submitChannelRating,
} from '../db/queries.js';
import { transitionDeal } from '../escrow/transitions.js';
import { notifyOwnerNewDeal, notifyAdvertiserApproved, notifyAdvertiserRejected } from './notifications.js';
import type { Channel, Deal } from '../shared/types.js';

const PUBLIC_MARKET_CHANNEL = '@foxdealads';

const CHANNEL_REJECTION_REASONS = [
  {
    code: 'missing_photo',
    label: 'Missing channel logo',
    ownerReason: 'Your channel profile photo is missing. Please add a clear logo and submit again.',
  },
  {
    code: 'content_policy',
    label: 'Content not acceptable',
    ownerReason: 'Your channel content does not meet our quality and safety requirements.',
  },
  {
    code: 'category_mismatch',
    label: 'Wrong category selected',
    ownerReason: 'The selected category does not match your channel content. Please choose the most relevant category.',
  },
  {
    code: 'insufficient_activity',
    label: 'Insufficient activity',
    ownerReason: 'Your channel does not currently show enough recent activity for listing.',
  },
  {
    code: 'private_or_unreachable',
    label: 'Channel not publicly accessible',
    ownerReason: 'Your channel is private or not publicly accessible. Please make it public and submit again.',
  },
] as const;

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
    `<b>Time Price:</b> ${channel.price} TON / ${channel.duration_hours}h\n` +
    (channel.cpc_price > 0 ? `<b>CPC Price:</b> ${channel.cpc_price} TON/click\n` : '') +
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
    ? `<b>Pricing:</b> CPC (${deal.budget} TON budget)`
    : `<b>Pricing:</b> Time-based (${deal.price} TON / ${deal.duration_hours}h)`;

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
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    // ── Channel approval ──
    if (
      data.startsWith('ch_approve:')
      || data.startsWith('ch_reject:')
      || data.startsWith('ch_reject_reason:')
    ) {
      await handleChannelCallback(ctx, data);
      return;
    }

    // ── Deal (ad) approval ──
    if (data.startsWith('ad_approve:') || data.startsWith('ad_reject:')) {
      await handleDealCallback(ctx, data);
      return;
    }

    // ── Owner direct deal approval from DM ──
    if (data.startsWith('owner_ad_approve:') || data.startsWith('owner_ad_reject:')) {
      await handleOwnerDealCallback(ctx, data);
      return;
    }

    // ── Advertiser rating callback ──
    if (data.startsWith('rate:')) {
      await handleRatingCallback(ctx, data);
      return;
    }

    // ── Owner rating advertiser callback ──
    if (data.startsWith('rate_adv:')) {
      await handleOwnerRatingCallback(ctx, data);
      return;
    }

    // Not handled here — pass to next middleware (e.g. ad_click handler)
    await next();
  });

  console.log('[bot] Admin channel handlers registered (channels + deals)');
}

// ── Channel callback handler ─────────────────────────────────────────

async function handleChannelCallback(ctx: any, data: string): Promise<void> {
  try {
    if (data.startsWith('ch_approve:')) {
      const channelId = Number(data.split(':')[1]);
      if (!channelId || Number.isNaN(channelId)) {
        await ctx.answerCallbackQuery({ text: 'Invalid channel ID' });
        return;
      }
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

      // Announce newly approved channel in public Fox Deal channel.
      await announceApprovedChannel(channel).catch((e) => {
        console.error('[admin] Failed to announce approved channel:', e);
      });
      return;
    }

    if (data.startsWith('ch_reject:')) {
      const channelId = Number(data.split(':')[1]);
      if (!channelId || Number.isNaN(channelId)) {
        await ctx.answerCallbackQuery({ text: 'Invalid channel ID' });
        return;
      }
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
      await ctx.answerCallbackQuery({ text: 'Select a rejection reason' });
      await ctx.editMessageReplyMarkup({
        reply_markup: {
          inline_keyboard: buildChannelRejectionKeyboard(channelId),
        },
      }).catch(() => {});
      return;
    }

    if (data.startsWith('ch_reject_reason:')) {
      const [_prefix, channelIdStr, reasonCode] = data.split(':');
      const channelId = Number(channelIdStr);
      if (!channelId || Number.isNaN(channelId)) {
        await ctx.answerCallbackQuery({ text: 'Invalid channel ID' });
        return;
      }
      const reason = CHANNEL_REJECTION_REASONS.find((item) => item.code === reasonCode);
      if (!reason) {
        await ctx.answerCallbackQuery({ text: 'Invalid reason' });
        return;
      }
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
      await rejectChannelWithReason(ctx, channel, reason.ownerReason, reason.label);
      return;
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

// ── Owner deal callback handler (from owner DM) ─────────────────────

async function handleOwnerDealCallback(ctx: any, data: string): Promise<void> {
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

    const channel = await getChannelById(deal.channel_id);
    if (!channel) {
      await ctx.answerCallbackQuery({ text: 'Channel not found' });
      return;
    }

    const user = await getUserByTelegramId(ctx.from.id);
    if (!user || user.id !== channel.owner_id) {
      await ctx.answerCallbackQuery({ text: 'Only the channel owner can do this.' });
      return;
    }

    if (deal.status !== 'pending_approval') {
      await ctx.answerCallbackQuery({ text: `Deal already ${deal.status}` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    if (action === 'owner_ad_approve') {
      const updated = await transitionDeal(dealId, 'pending_approval', 'approved');
      await notifyAdvertiserApproved(updated).catch((e) =>
        console.error('[owner] Failed to notify advertiser approved:', e),
      );
      await ctx.answerCallbackQuery({ text: '✅ Deal approved' });
      await markOwnerMessageResolved(ctx, '✅ APPROVED');
      return;
    }

    if (action === 'owner_ad_reject') {
      const updated = await transitionDeal(dealId, 'pending_approval', 'rejected', {
        rejection_reason: 'Rejected by channel owner',
      });
      await notifyAdvertiserRejected(updated).catch((e) =>
        console.error('[owner] Failed to notify advertiser rejected:', e),
      );
      await ctx.answerCallbackQuery({ text: '❌ Deal rejected' });
      await markOwnerMessageResolved(ctx, '❌ REJECTED');
    }
  } catch (err) {
    console.error('[owner] Deal callback error:', err);
    await ctx.answerCallbackQuery({ text: 'Error processing action' });
  }
}

async function handleRatingCallback(ctx: any, data: string): Promise<void> {
  const [_prefix, dealIdStr, scoreStr] = data.split(':');
  const dealId = Number(dealIdStr);
  const score = Number(scoreStr);

  if (!dealId || Number.isNaN(dealId) || score < 1 || score > 5) {
    await ctx.answerCallbackQuery({ text: 'Invalid rating request' });
    return;
  }

  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'User not found' });
      return;
    }

    const deal = await getDealById(dealId);
    if (!deal) {
      await ctx.answerCallbackQuery({ text: 'Deal not found' });
      return;
    }

    if (deal.advertiser_id !== user.id) {
      await ctx.answerCallbackQuery({ text: 'Only the advertiser can rate this deal.' });
      return;
    }

    const rating = await submitChannelRating(dealId, user.id, score);
    if (!rating) {
      await ctx.answerCallbackQuery({ text: 'Rating already submitted or not eligible yet.' });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery({ text: `Thanks! You rated ${score}/5 ⭐` });

    const channel = await getChannelById(deal.channel_id);
    const label = `${'⭐'.repeat(score)}${'☆'.repeat(5 - score)}`;
    const doneText =
      `<b>Thanks for your feedback!</b>\n\n` +
      `Your rating for ${channel ? `@${escapeHtml(channel.username)}` : `channel #${deal.channel_id}`} has been saved.\n` +
      `<b>Score:</b> ${label} (${score}/5)`;

    if (ctx.callbackQuery.message?.text) {
      await ctx.editMessageText(doneText, {
        parse_mode: 'HTML',
        reply_markup: undefined,
      }).catch(() => {});
    } else {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    }
  } catch (err) {
    console.error('[rating] Callback error:', err);
    await ctx.answerCallbackQuery({ text: 'Failed to save rating' });
  }
}

async function handleOwnerRatingCallback(ctx: any, data: string): Promise<void> {
  const [_prefix, dealIdStr, scoreStr] = data.split(':');
  const dealId = Number(dealIdStr);
  const score = Number(scoreStr);

  if (!dealId || Number.isNaN(dealId) || score < 1 || score > 5) {
    await ctx.answerCallbackQuery({ text: 'Invalid rating request' });
    return;
  }

  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'User not found' });
      return;
    }

    const deal = await getDealById(dealId);
    if (!deal) {
      await ctx.answerCallbackQuery({ text: 'Deal not found' });
      return;
    }

    const channel = await getChannelById(deal.channel_id);
    if (!channel || channel.owner_id !== user.id) {
      await ctx.answerCallbackQuery({ text: 'Only the channel owner can rate this advertiser.' });
      return;
    }

    const rating = await submitAdvertiserRating(dealId, user.id, score);
    if (!rating) {
      await ctx.answerCallbackQuery({ text: 'Rating already submitted or not eligible yet.' });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery({ text: `Thanks! You rated ${score}/5 ⭐` });

    const label = `${'⭐'.repeat(score)}${'☆'.repeat(5 - score)}`;
    const doneText =
      `<b>Thanks for your feedback!</b>\n\n` +
      `Your advertiser rating has been saved.\n` +
      `<b>Score:</b> ${label} (${score}/5)`;

    if (ctx.callbackQuery.message?.text) {
      await ctx.editMessageText(doneText, {
        parse_mode: 'HTML',
        reply_markup: undefined,
      }).catch(() => {});
    } else {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    }
  } catch (err) {
    console.error('[owner-rating] Callback error:', err);
    await ctx.answerCallbackQuery({ text: 'Failed to save rating' });
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

async function announceApprovedChannel(channel: Channel): Promise<void> {
  const hasPublicUsername = /^[A-Za-z0-9_]{5,}$/.test(channel.username);
  const channelLabel = hasPublicUsername
    ? `@${escapeHtml(channel.username)}`
    : escapeHtml(channel.username);
  const cpcLine = channel.cpc_price > 0
    ? `\n<b>CPC:</b> ${channel.cpc_price} TON/click`
    : '';

  const text =
    `<b>👋 Hello & welcome!</b>\n\n` +
    `A new channel has joined Fox Deal.\n\n` +
    `<b>Channel:</b> ${channelLabel}\n` +
    `<b>Category:</b> ${escapeHtml(channel.category)}\n` +
    `<b>Subscribers:</b> ${channel.subscribers.toLocaleString()}\n` +
    `<b>Time Price:</b> ${channel.price} TON / ${channel.duration_hours}h` +
    `${cpcLine}`;
  const photoFile = await getChannelPhotoFile(channel);
  if (photoFile) {
    try {
      await bot.api.sendPhoto(PUBLIC_MARKET_CHANNEL, photoFile, {
        caption: text,
        parse_mode: 'HTML',
      });
      return;
    } catch (err) {
      console.warn('[admin] Could not send approved-channel photo announcement:', (err as Error).message);
    }
  }

  await bot.api.sendMessage(PUBLIC_MARKET_CHANNEL, text, { parse_mode: 'HTML' });
}

function buildChannelRejectionKeyboard(channelId: number) {
  const reasonButtons = CHANNEL_REJECTION_REASONS.map((reason) => ([
    { text: reason.label, callback_data: `ch_reject_reason:${channelId}:${reason.code}` },
  ]));
  return reasonButtons;
}

async function rejectChannelWithReason(
  ctx: any,
  channel: Channel,
  ownerReason: string,
  selectedLabel: string,
): Promise<void> {
  await rejectChannel(channel.id);
  await ctx.answerCallbackQuery({ text: '❌ Channel rejected' });

  const originalText = ctx.callbackQuery.message?.text ?? '';
  await updateChannelRejectionMessage(
    ctx.callbackQuery.message?.chat?.id,
    ctx.callbackQuery.message?.message_id,
    originalText,
    false,
    ownerReason,
    selectedLabel,
  );

  await notifyChannelOwnerRejected(channel, ownerReason);
}

async function updateChannelRejectionMessage(
  adminChatId: number | undefined,
  messageId: number | undefined,
  originalText: string,
  isPhotoMessage: boolean,
  ownerReason: string,
  selectedLabel: string,
): Promise<void> {
  if (!adminChatId || !messageId) return;

  const rejectionTail =
    `\n\n❌ <b>REJECTED</b>` +
    `\n<b>Reason:</b> ${escapeHtml(selectedLabel)}` +
    `\n<b>Owner Note:</b> ${escapeHtml(ownerReason)}`;

  if (isPhotoMessage) {
    await bot.api.editMessageCaption(adminChatId, messageId, {
      caption: `${originalText}${rejectionTail}`,
      parse_mode: 'HTML',
      reply_markup: undefined,
    }).catch(() => {});
    return;
  }

  await bot.api.editMessageText(adminChatId, messageId, `${originalText}${rejectionTail}`, {
    parse_mode: 'HTML',
    reply_markup: undefined,
  }).catch(() => {});
}

async function notifyChannelOwnerRejected(channel: Channel, reason: string): Promise<void> {
  const telegramId = await getTelegramId(channel.owner_id);
  if (!telegramId) return;
  await bot.api.sendMessage(
    telegramId,
    `<b>❌ Channel not approved</b>\n\n` +
      `Your channel @${escapeHtml(channel.username)} was not approved for the Fox Deal catalog.\n\n` +
      `<b>Reason:</b> ${escapeHtml(reason)}\n\n` +
      `Please review the issue and submit the channel again.`,
    { parse_mode: 'HTML' },
  ).catch(() => {});
}

async function getChannelPhotoFile(channel: Channel): Promise<InputFile | null> {
  if (!channel.photo_url) return null;
  try {
    const photoUrl = resolveImageUrl(channel.photo_url);
    const resp = await fetch(photoUrl);
    if (!resp.ok) return null;
    const bytes = Buffer.from(await resp.arrayBuffer());
    if (bytes.length === 0) return null;
    return new InputFile(bytes, `channel-${channel.id}.jpg`);
  } catch {
    return null;
  }
}

async function markOwnerMessageResolved(ctx: any, label: string): Promise<void> {
  const originalText = ctx.callbackQuery.message?.text ?? ctx.callbackQuery.message?.caption ?? '';
  if (ctx.callbackQuery.message?.photo) {
    await ctx.editMessageCaption({
      caption: `${originalText}\n\n${label}`,
      parse_mode: 'HTML',
      reply_markup: undefined,
    }).catch(() => {});
  } else {
    await ctx.editMessageText(`${originalText}\n\n${label}`, {
      parse_mode: 'HTML',
      reply_markup: undefined,
    }).catch(() => {});
  }
}
