import { bot } from './index.js';
import { env } from '../config/env.js';

const awaitingSupportRequest = new Set<number>();
const supportThreadByAdminMessageId = new Map<number, number>();

/**
 * Register support chat handlers.
 *
 * Flow:
 * 1) User sends /support (or taps keyboard button with /support text).
 * 2) Bot asks for a single message and marks user as waiting.
 * 3) Next user text is forwarded to admin channel.
 * 4) Support team replies in admin channel; bot relays reply back to the user.
 */
export function registerSupportHandlers(): void {
  bot.command('support', async (ctx) => {
    if (!ctx.from) return;

    awaitingSupportRequest.add(ctx.from.id);
    await ctx.reply(
      'Please send your support request in one message. Our support team will reply to you here.',
    );
  });

  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !ctx.chat || ctx.chat.type !== 'private') return;
    if (!awaitingSupportRequest.has(userId)) return;

    const text = ctx.message.text.trim();
    // If user sends any command while waiting, cancel support capture and let command handlers work.
    if (text.startsWith('/')) {
      awaitingSupportRequest.delete(userId);
      return;
    }
    if (!text) return;

    awaitingSupportRequest.delete(userId);

    try {
      const forwarded = await ctx.forwardMessage(env.ADMIN_CHANNEL_ID);
      supportThreadByAdminMessageId.set(forwarded.message_id, userId);

      const username = ctx.from?.username ? `@${ctx.from.username}` : 'no username';
      const meta = await bot.api.sendMessage(
        env.ADMIN_CHANNEL_ID,
        [
          'New support request',
          `User ID: ${userId}`,
          `Username: ${username}`,
          'Reply to this message or the forwarded message to answer the user.',
        ].join('\n'),
      );
      supportThreadByAdminMessageId.set(meta.message_id, userId);

      await ctx.reply('Your request was sent to support. Please wait for a reply.');
    } catch (err) {
      console.error('[support] Failed to forward support request:', err);
      await ctx.reply('Failed to send your request to support. Please try again with /support.');
    }
  });

  bot.on('message', async (ctx) => {
    if (!ctx.chat || ctx.chat.id !== env.ADMIN_CHANNEL_ID) return;

    const repliedMessageId = ctx.message.reply_to_message?.message_id;
    if (!repliedMessageId) return;

    const userId = supportThreadByAdminMessageId.get(repliedMessageId);
    if (!userId) return;

    try {
      await bot.api.copyMessage(userId, env.ADMIN_CHANNEL_ID, ctx.message.message_id);
    } catch (err) {
      console.error(`[support] Failed to relay support reply to user ${userId}:`, err);
      await bot.api.sendMessage(
        env.ADMIN_CHANNEL_ID,
        `Could not deliver this reply to user ${userId}. They may have blocked the bot.`,
      );
    }
  });

  console.log('[bot] Support handlers registered');
}
