import { Bot } from 'grammy';
import { env } from '../config/env.js';

export const bot = new Bot(env.BOT_TOKEN);

// /start command
bot.command('start', async (ctx) => {
  await ctx.reply(
    'Welcome to Fox Deal! 🦊\n\n' +
    'Browse channels, place ads, and manage deals — all powered by escrow.\n\n' +
    'Tap the button below to get started.',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Open Fox Deal', web_app: { url: env.MINI_APP_URL } },
        ]],
      },
    },
  );
});

// Error handler
bot.catch((err) => {
  console.error('[bot] Error:', err.message);
});

export async function startBot(): Promise<void> {
  // Register payment handlers (must be done before bot.start)
  const { registerPaymentHandlers } = await import('./payments.js');
  registerPaymentHandlers();

  console.log('[bot] Starting Telegram bot...');
  await bot.start();

  // Resume any in-progress posted deals
  const { resumePostedDeals } = await import('./jobs.js');
  await resumePostedDeals();

  // Start expiry job (auto-expire stale deals)
  const { startExpiryJob } = await import('./expiry.js');
  startExpiryJob();

  // Start channel admin check job
  const { startChannelCheckJob } = await import('./channelCheck.js');
  startChannelCheckJob();
}
