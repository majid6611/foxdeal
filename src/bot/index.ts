import { Bot } from 'grammy';
import { env } from '../config/env.js';
import { ensureUserByTelegramId } from '../db/queries.js';

export const bot = new Bot(env.BOT_TOKEN);

/** Bot username, resolved at startup via getMe(). Used for deep links. */
export let botUsername = '';

// /start command
bot.command('start', async (ctx) => {
  // Persist user chat/account ID on first interaction.
  if (ctx.from?.id) {
    try {
      await ensureUserByTelegramId(ctx.from.id, ctx.from.username ?? null);
    } catch (err) {
      console.error('[bot] Failed to ensure user on /start:', (err as Error).message);
    }
  }

  const welcomeText = 'Welcome to Fox Deal! 🦊\n\n'
    + 'Browse channels, place ads, and manage deals — all powered by escrow.\n\n'
    + 'Tap the button below to get started.';

  // Web App inline button is supported in private chats.
  if (ctx.chat?.type === 'private') {
    await ctx.reply(welcomeText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open Fox Deal', web_app: { url: env.MINI_APP_URL } }],
          [{ text: 'Support', url: 'https://t.me/majidredhat' }],
        ],
      },
    });
  } else {
    await ctx.reply(
      'Welcome to Fox Deal! 🦊\n\n'
      + 'Please open a private chat with me to use "Open Fox Deal".',
    );
  }
});

// Error handler
bot.catch((err) => {
  console.error('[bot] Error:', err.message);
});

export async function startBot(): Promise<void> {
  // Resolve bot username for deep links
  const me = await bot.api.getMe();
  botUsername = me.username;
  console.log(`[bot] Bot username: @${botUsername}`);

  // Register payment handlers (must be done before bot.start)
  const { registerPaymentHandlers } = await import('./payments.js');
  registerPaymentHandlers();

  // Register admin channel approval/rejection handlers
  const { registerAdminChannelHandlers } = await import('./adminChannel.js');
  registerAdminChannelHandlers();

  // Register withdraw-request admin workflow handlers
  const { registerWithdrawAdminHandlers } = await import('./withdrawAdmin.js');
  registerWithdrawAdminHandlers();

  // Resume any in-progress posted deals
  const { resumePostedDeals } = await import('./jobs.js');
  await resumePostedDeals();

  // Start expiry job (auto-expire stale deals)
  const { startExpiryJob } = await import('./expiry.js');
  startExpiryJob();

  // Start channel admin check job
  const { startChannelCheckJob } = await import('./channelCheck.js');
  startChannelCheckJob();

  // Start periodic ad views sync (time-based posted deals)
  const { startAdViewsSyncJob } = await import('./adViews.js');
  startAdViewsSyncJob();

  console.log('[bot] Starting Telegram bot...');
  // Do not await: polling runs indefinitely and would block startup hooks above.
  void bot.start().catch((err) => {
    console.error('[bot] Polling failed:', (err as Error).message);
  });
}
