import { bot } from './index.js';
import {
  getDealById,
  getChannelById,
  recordVisitorClick,
  spendClick,
  incrementClickCount,
} from '../db/queries.js';

/**
 * Register callback handler for inline ad clicks.
 * callback_data format: ad_click:{dealId}
 *
 * This replaces the old URL-based click tracking. Callback buttons are silent —
 * no "Open this link?" confirmation dialog. The bot processes the click instantly.
 * Uses Telegram user ID for deduplication (much more reliable than IP+UA).
 */
export function registerClickHandler(): void {
  bot.callbackQuery(/^ad_click:(\d+)$/, async (ctx) => {
    try {
      const dealId = Number(ctx.match[1]);
      const userId = ctx.from.id;
      const deal = await getDealById(dealId);

      if (!deal || !deal.ad_link) {
        await ctx.answerCallbackQuery({ text: 'This ad is no longer available.' });
        return;
      }

      // Use Telegram user ID as the unique visitor hash (best dedup possible)
      const visitorHash = `tg_${userId}`;

      // Try to record as a unique click
      const isNewClick = await recordVisitorClick(dealId, visitorHash);

      if (isNewClick) {
        if (deal.pricing_model === 'cpc' && deal.status === 'posted') {
          // CPC deal: deduct click cost from budget
          const channel = await getChannelById(deal.channel_id);
          const cpcPrice = channel ? Number(channel.cpc_price) : 0;

          if (cpcPrice > 0) {
            const updated = await spendClick(dealId, cpcPrice);

            // Check if budget is now exhausted
            if (updated && Number(updated.budget_spent) >= updated.budget) {
              const { completeCpcDeal } = await import('./jobs.js');
              completeCpcDeal(dealId).catch((err: unknown) =>
                console.error(`[click] Failed to complete CPC deal ${dealId}:`, err),
              );
            }
          }

          console.log(`[click] New unique CPC click: deal ${dealId}, user ${userId}`);
        } else {
          // Time-based deal: just increment click count
          incrementClickCount(dealId).catch(() => {});
          console.log(`[click] New unique click: deal ${dealId}, user ${userId}`);
        }
      } else {
        console.log(`[click] Duplicate click ignored: deal ${dealId}, user ${userId}`);
      }

      // Answer the callback silently (no toast), then send a DM with the clickable link
      await ctx.answerCallbackQuery();

      // Send the user a DM with the clickable link
      try {
        await bot.api.sendMessage(userId, `🔗 <a href="${deal.ad_link}">${deal.ad_link}</a>`, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: false },
        });
      } catch (dmErr) {
        // User hasn't started the bot — can't DM them. Show a fallback alert.
        console.warn(`[click] Cannot DM user ${userId}:`, (dmErr as Error).message);
      }
    } catch (err) {
      console.error('[click] Callback error:', err);
      await ctx.answerCallbackQuery({ text: 'Something went wrong.' });
    }
  });

  console.log('[bot] Ad click callback handler registered');
}
