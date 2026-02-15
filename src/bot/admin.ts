import { bot } from './index.js';
import { env } from '../config/env.js';

/**
 * Check if the bot is an admin of a given channel.
 * Returns true if the bot has admin rights, false otherwise.
 */
export async function isBotAdminOfChannel(channelId: string | number): Promise<boolean> {
  try {
    const botInfo = await bot.api.getMe();
    const member = await bot.api.getChatMember(channelId, botInfo.id);
    return member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

/**
 * Get channel info from Telegram, including profile photo URL.
 * Returns null if the bot can't access the channel.
 */
export async function getChannelInfo(channelId: string | number) {
  try {
    const chat = await bot.api.getChat(channelId);
    if (chat.type !== 'channel') return null;

    const memberCount = await bot.api.getChatMemberCount(channelId);

    // Try to get the channel profile photo URL
    let photoUrl: string | null = null;
    try {
      if (chat.photo) {
        const file = await bot.api.getFile(chat.photo.big_file_id);
        if (file.file_path) {
          photoUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
        }
      }
    } catch (err) {
      console.warn('[bot] Could not fetch channel photo:', (err as Error).message);
    }

    return {
      id: chat.id,
      title: chat.title,
      username: 'username' in chat ? chat.username : undefined,
      memberCount,
      photoUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Post a message to a channel. Returns the message ID or null on failure.
 * If a dealId is provided (and the deal has a link), adds an inline "Learn More"
 * button using a t.me deep link (startapp=click_{dealId}). Because it's a t.me
 * URL, Telegram opens it instantly — no "Open this link?" confirmation.
 * The Mini App handles click tracking + redirect to the final destination.
 */
export async function postToChannel(
  channelId: string | number,
  text: string,
  imageUrl?: string | null,
  dealId?: number | null,
): Promise<number | null> {
  try {
    const { botUsername } = await import('./index.js');
    const reply_markup = dealId && botUsername
      ? { inline_keyboard: [[{ text: '🔗 Learn More', url: `https://t.me/${botUsername}?startapp=click_${dealId}` }]] }
      : undefined;

    if (imageUrl) {
      // Convert relative URLs to absolute (Telegram needs a public URL)
      const fullUrl = resolveImageUrl(imageUrl);
      const msg = await bot.api.sendPhoto(channelId, fullUrl, {
        caption: text,
        reply_markup,
      });
      return msg.message_id;
    }
    const msg = await bot.api.sendMessage(channelId, text, { reply_markup });
    return msg.message_id;
  } catch (err) {
    console.error(`[bot] Failed to post to channel ${channelId}:`, (err as Error).message);
    return null;
  }
}

/**
 * Convert a relative /api/upload/... URL to a full public URL.
 */
function resolveImageUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const base = env.MINI_APP_URL.replace(/\/$/, '');
  return `${base}${url}`;
}

/**
 * Check if a message still exists in a channel.
 * Uses forwardMessage to the channel itself — if message is deleted, it throws.
 * We forward to the same channel and then delete the forwarded copy.
 */
export async function isMessageAlive(
  channelId: string | number,
  messageId: number,
): Promise<boolean> {
  try {
    // Try to copy the message to the same channel (silent) — fails if original is deleted
    const copied = await bot.api.copyMessage(channelId, channelId, messageId, {
      disable_notification: true,
    });
    // Delete the copy immediately so it doesn't clutter the channel
    try {
      await bot.api.deleteMessage(channelId, copied.message_id);
    } catch {
      // Ignore delete errors
    }
    return true;
  } catch (err) {
    const msg = (err as Error).message ?? '';
    // "message to copy not found" = deleted, other errors = assume alive (don't refund on API glitches)
    if (msg.includes('not found') || msg.includes('message to forward not found')) {
      return false;
    }
    // For other errors (rate limit, network), assume post is still alive
    console.warn(`[bot] isMessageAlive uncertain for ${channelId}/${messageId}: ${msg}, assuming alive`);
    return true;
  }
}
