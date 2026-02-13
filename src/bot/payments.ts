import { bot } from './index.js';
import { getDealById } from '../db/queries.js';
import { holdEscrow } from '../escrow/transitions.js';
import { autoPostDeal } from './jobs.js';

/**
 * Send a Telegram Stars invoice to the advertiser for a deal (via bot DM).
 */
export async function sendPaymentInvoice(
  telegramUserId: number,
  dealId: number,
  amount: number,
  channelUsername: string,
): Promise<void> {
  await bot.api.sendInvoice(
    telegramUserId,
    `Ad placement in @${channelUsername}`,
    `Pay ${amount} Stars to place your ad. Payment is held in escrow until the ad is verified.`,
    `deal_${dealId}`,
    'XTR',
    [{ label: 'Ad Placement', amount }],
    { provider_token: '' },
  );
}

/**
 * Create an invoice link that can be opened in a Mini App via WebApp.openInvoice().
 */
export async function createInvoiceLink(
  dealId: number,
  amount: number,
  channelUsername: string,
): Promise<string> {
  const link = await bot.api.createInvoiceLink(
    `Ad placement in @${channelUsername}`,
    `Pay ${amount} Stars to place your ad. Payment is held in escrow until the ad is verified.`,
    `deal_${dealId}`,
    '',    // provider_token (empty for Telegram Stars)
    'XTR', // currency
    [{ label: 'Ad Placement', amount }],
  );
  return link;
}

/**
 * Register payment handlers on the bot.
 */
export function registerPaymentHandlers(): void {
  // Pre-checkout: validate the deal is still in approved state
  bot.on('pre_checkout_query', async (ctx) => {
    const payload = ctx.preCheckoutQuery.invoice_payload;
    const dealId = parseDealPayload(payload);

    if (!dealId) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: 'Invalid payment payload',
      });
      return;
    }

    const deal = await getDealById(dealId);
    if (!deal || deal.status !== 'approved') {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: 'This deal is no longer available for payment',
      });
      return;
    }

    // All good — allow payment
    await ctx.answerPreCheckoutQuery(true);
  });

  // Successful payment: hold escrow and auto-post
  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const payload = payment.invoice_payload;
    const dealId = parseDealPayload(payload);

    if (!dealId) {
      console.error('[payments] Invalid payload on successful_payment:', payload);
      return;
    }

    const deal = await getDealById(dealId);
    if (!deal) {
      console.error('[payments] Deal not found for successful_payment:', dealId);
      return;
    }

    try {
      // Hold escrow: approved → escrow_held
      await holdEscrow(dealId, deal.price);
      console.log(`[payments] Escrow held for deal ${dealId}`);

      await ctx.reply(`Payment received! Your ad will be posted to the channel shortly.`);

      // Auto-post the ad
      await autoPostDeal(dealId);
    } catch (err) {
      console.error(`[payments] Error processing payment for deal ${dealId}:`, err);
      await ctx.reply(`There was an issue processing your payment. Please contact support.`);
    }
  });
}

function parseDealPayload(payload: string): number | null {
  const match = payload.match(/^deal_(\d+)$/);
  return match ? Number(match[1]) : null;
}
