import { bot } from './index.js';
import { env } from '../config/env.js';
import { GrammyError, HttpError } from 'grammy';

export interface BotAdminCheckResult {
  isAdmin: boolean;
  isDefinitive: boolean;
  reason: string;
}

/**
 * Check if the bot is an admin of a given channel.
 * Returns true if the bot has admin rights, false otherwise.
 */
export async function isBotAdminOfChannel(channelId: string | number): Promise<boolean> {
  const result = await checkBotAdminStatus(channelId);
  return result.isAdmin;
}

/**
 * Check bot admin status with error classification.
 * `isDefinitive=false` means we could not reliably determine status due to transient/network errors.
 */
export async function checkBotAdminStatus(channelId: string | number): Promise<BotAdminCheckResult> {
  try {
    const botInfo = await bot.api.getMe();
    const member = await bot.api.getChatMember(channelId, botInfo.id);
    const isAdmin = member.status === 'administrator' || member.status === 'creator';
    return {
      isAdmin,
      isDefinitive: true,
      reason: `chat member status=${member.status}`,
    };
  } catch (err) {
    if (err instanceof HttpError) {
      return {
        isAdmin: false,
        isDefinitive: false,
        reason: `network/http error: ${err.message}`,
      };
    }

    if (err instanceof GrammyError) {
      const desc = err.description.toLowerCase();
      const transient = err.error_code === 429
        || err.error_code >= 500
        || desc.includes('timeout')
        || desc.includes('temporarily')
        || desc.includes('try again');
      return {
        isAdmin: false,
        isDefinitive: !transient,
        reason: `telegram error ${err.error_code}: ${err.description}`,
      };
    }

    return {
      isAdmin: false,
      isDefinitive: false,
      reason: `unknown error: ${(err as Error)?.message ?? String(err)}`,
    };
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
 * Fetch public channel stats by scraping t.me/s/<username>.
 * Returns null-ish stats when unavailable (private channel, no recent posts, or parse failure).
 */
export async function getChannelPublicStats(
  username: string,
  sampleSize = 10,
): Promise<{ avgPostViews: number | null; mostUsedLanguage: string | null }> {
  const clean = username.replace(/^@/, '').trim();
  if (!clean) {
    return { avgPostViews: null, mostUsedLanguage: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(`https://t.me/s/${clean}`, {
      signal: controller.signal,
      headers: {
        // Keep a real UA to reduce 403/anti-bot false positives.
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    if (!resp.ok) {
      return { avgPostViews: null, mostUsedLanguage: null };
    }
    const html = await resp.text();

    const viewMatches = [...html.matchAll(/tgme_widget_message_views[^>]*>([^<]+)</g)]
      .map((m) => m[1]?.trim() ?? '')
      .map(parseViewsText)
      .filter((v): v is number => v !== null);

    const viewSlice = viewMatches.slice(0, sampleSize);
    const avgPostViews = viewSlice.length > 0
      ? Math.round(viewSlice.reduce((sum, v) => sum + v, 0) / viewSlice.length)
      : null;

    // Extract recent post message text and detect dominant language.
    const textMatches = [...html.matchAll(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/g)]
      .map((m) => stripHtml(m[1] ?? ''))
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, sampleSize);

    const languageCounts = new Map<string, number>();
    for (const text of textMatches) {
      const lang = detectLanguage(text);
      if (!lang) continue;
      languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
    }

    const classifiedPosts = [...languageCounts.values()].reduce((sum, v) => sum + v, 0);
    const rankedLanguages = [...languageCounts.entries()].sort((a, b) => b[1] - a[1]);
    const top = rankedLanguages[0];
    const second = rankedLanguages[1];

    // Save only when language signal is strong enough.
    const mostUsedLanguage = (
      top
      && classifiedPosts >= 3
      && top[1] >= Math.ceil(classifiedPosts * 0.5)
      && (!second || top[1] > second[1])
    )
      ? top[0]
      : null;

    return { avgPostViews, mostUsedLanguage };
  } catch {
    return { avgPostViews: null, mostUsedLanguage: null };
  } finally {
    clearTimeout(timeout);
  }
}

// Backwards-compatible helper for existing callers.
export async function getChannelAverageViews(username: string, sampleSize = 10): Promise<number | null> {
  const stats = await getChannelPublicStats(username, sampleSize);
  return stats.avgPostViews;
}

function parseViewsText(raw: string): number | null {
  const text = raw.replace(/[,\s]/g, '').toUpperCase();
  if (!text) return null;

  const match = text.match(/^(\d+(?:\.\d+)?)([KM]?)$/);
  if (!match) return null;

  const value = Number(match[1]);
  const suffix = match[2];

  if (!Number.isFinite(value)) return null;
  if (suffix === 'K') return Math.round(value * 1_000);
  if (suffix === 'M') return Math.round(value * 1_000_000);
  return Math.round(value);
}

function stripHtml(raw: string): string {
  return decodeHtmlEntities(raw.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function detectLanguage(text: string): string | null {
  const sample = text.trim();
  if (!sample) return null;

  // Script-based detection for non-Latin alphabets.
  if (countMatches(sample, /[\u4E00-\u9FFF]/g) >= 4) return 'zh';
  if (countMatches(sample, /[\u3040-\u30FF]/g) >= 4) return 'ja';
  if (countMatches(sample, /[\uAC00-\uD7AF]/g) >= 4) return 'ko';
  if (countMatches(sample, /[\u0400-\u04FF]/g) >= 4) return 'ru';
  if (countMatches(sample, /[\u0600-\u06FF]/g) >= 4) return 'ar';
  if (countMatches(sample, /[\u0590-\u05FF]/g) >= 4) return 'he';
  if (countMatches(sample, /[\u0900-\u097F]/g) >= 4) return 'hi';
  if (countMatches(sample, /[\u0E00-\u0E7F]/g) >= 4) return 'th';

  // Light-weight Latin-language detection from common stopwords.
  const normalized = sample.toLowerCase();
  const words = normalized.split(/[^a-z]+/).filter(Boolean);
  if (words.length === 0) return null;

  const stopwords: Record<string, string[]> = {
    en: ['the', 'and', 'you', 'for', 'with', 'this', 'that', 'from'],
    es: ['que', 'los', 'las', 'por', 'para', 'con', 'una', 'del'],
    pt: ['que', 'para', 'com', 'uma', 'nao', 'dos', 'das', 'por'],
    fr: ['les', 'des', 'pour', 'avec', 'une', 'dans', 'est', 'pas'],
    de: ['und', 'der', 'die', 'das', 'mit', 'fur', 'ist', 'nicht'],
    tr: ['ve', 'bir', 'icin', 'ile', 'bu', 'cok', 'daha', 'gibi'],
    id: ['dan', 'yang', 'untuk', 'dengan', 'ini', 'itu', 'dari', 'pada'],
  };

  let bestLang: string | null = null;
  let bestScore = 0;
  let secondBestScore = 0;
  for (const [lang, commonWords] of Object.entries(stopwords)) {
    let score = 0;
    for (const word of words) {
      if (commonWords.includes(word)) score++;
    }
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestLang = lang;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  // Require a minimum margin and enough evidence before classifying Latin text.
  if (!bestLang) return null;
  if (bestScore < 2) return null;
  if (bestScore <= secondBestScore) return null;
  return bestLang;
}

function countMatches(text: string, regex: RegExp): number {
  return text.match(regex)?.length ?? 0;
}

/**
 * Post a message to a channel. Returns the message ID or null on failure.
 *
 * For CPC ads: uses a t.me deep link (startapp=click_{dealId}) for click tracking + billing.
 * For time-based ads: uses the direct URL (no tracking overhead, opens instantly).
 */
export async function postToChannel(
  channelId: string | number,
  text: string,
  imageUrl?: string | null,
  buttonUrl?: string | null,
  buttonLabel?: string | null,
): Promise<number | null> {
  try {
    const reply_markup = buttonUrl
      ? { inline_keyboard: [[{ text: buttonLabel || '🔗 Learn More', url: buttonUrl }]] }
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
 * Uses copyMessage into a dedicated check channel — if source message is deleted, it throws.
 * This avoids creating any visible duplicate posts in the original channel.
 */
export async function isMessageAlive(
  channelId: string | number,
  messageId: number,
): Promise<boolean> {
  try {
    const checkChannelId = env.LIVENESS_CHECK_CHANNEL_ID ?? env.ADMIN_CHANNEL_ID;

    // Copy into a dedicated check channel for a non-invasive liveness check.
    const copied = await bot.api.copyMessage(checkChannelId, channelId, messageId, {
      disable_notification: true,
    });
    // Delete the copy immediately so check channel stays clean.
    try {
      await bot.api.deleteMessage(checkChannelId, copied.message_id);
    } catch {
      // Ignore delete errors
    }
    return true;
  } catch (err) {
    const msg = (err as Error).message ?? '';
    const lowered = msg.toLowerCase();
    // Missing/invalid source message should be treated as deleted.
    if (
      lowered.includes('not found')
      || lowered.includes('message to forward not found')
      || lowered.includes('message_id_invalid')
      || lowered.includes('message id invalid')
    ) {
      return false;
    }
    // For other errors (rate limit, network), assume post is still alive
    console.warn(`[bot] isMessageAlive uncertain for ${channelId}/${messageId}: ${msg}, assuming alive`);
    return true;
  }
}
