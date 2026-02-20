import { bot } from './index.js';
import { env } from '../config/env.js';
import {
  cancelWithdrawRequest,
  getLatestAwaitingWithdrawRequestByAdminChat,
  getWithdrawRequestById,
  markWithdrawRequestAwaitingTxLink,
  markWithdrawRequestPaid,
  setWithdrawRequestAdminMessage,
} from '../db/queries.js';
import type { WithdrawRequest } from '../shared/types.js';
import { pool } from '../db/index.js';

function isWithdrawAdmin(ctx: any): boolean {
  const fromId = Number(ctx.from?.id ?? 0);
  const chatId = Number(ctx.chat?.id ?? ctx.callbackQuery?.message?.chat?.id ?? 0);
  return fromId === env.WITHDRAW_ADMIN_CHAT_ID || chatId === env.WITHDRAW_ADMIN_CHAT_ID;
}

function baseKeyboard(requestId: number) {
  return {
    inline_keyboard: [[
      { text: 'Paid', callback_data: `wd_paid:${requestId}` },
      { text: 'Cancel', callback_data: `wd_cancel:${requestId}` },
    ]],
  };
}

function confirmKeyboard(requestId: number, action: 'paid' | 'cancel') {
  const actionData = action === 'paid'
    ? `wd_paid_confirm:${requestId}`
    : `wd_cancel_confirm:${requestId}`;
  return {
    inline_keyboard: [[
      { text: `Confirm ${action === 'paid' ? 'Paid' : 'Cancel'}`, callback_data: actionData },
      { text: 'Back', callback_data: `wd_back:${requestId}` },
    ]],
  };
}

function formatRequest(request: WithdrawRequest): string {
  return (
    `<b>Withdraw Request #${request.id}</b>\n\n` +
    `<b>Owner ID:</b> ${request.owner_id}\n` +
    `<b>Amount:</b> ${request.amount} TON\n` +
    `<b>Wallet:</b> <code>${request.wallet_address}</code>\n` +
    `<b>Status:</b> ${request.status}` +
    (request.tx_link ? `\n<b>TX:</b> ${request.tx_link}` : '')
  );
}

async function notifyOwner(ownerId: number, message: string): Promise<void> {
  const { rows } = await pool.query<{ telegram_id: string }>(
    'SELECT telegram_id FROM users WHERE id = $1',
    [ownerId],
  );
  if (!rows[0]) return;
  await bot.api.sendMessage(Number(rows[0].telegram_id), message).catch(() => {});
}

export async function sendWithdrawRequestToAdmin(
  request: WithdrawRequest,
  ownerTelegramId: number,
): Promise<void> {
  const text =
    `<b>New Withdraw Request</b>\n\n` +
    `<b>Request ID:</b> #${request.id}\n` +
    `<b>Owner:</b> ${ownerTelegramId} (user #${request.owner_id})\n` +
    `<b>Amount:</b> ${request.amount} TON\n` +
    `<b>Wallet:</b> <code>${request.wallet_address}</code>\n\n` +
    `Choose action below.`;

  const msg = await bot.api.sendMessage(env.WITHDRAW_ADMIN_CHAT_ID, text, {
    parse_mode: 'HTML',
    reply_markup: baseKeyboard(request.id),
  });

  await setWithdrawRequestAdminMessage(request.id, msg.message_id);
}

export function registerWithdrawAdminHandlers(): void {
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith('wd_')) {
      await next();
      return;
    }

    if (!isWithdrawAdmin(ctx)) {
      await ctx.answerCallbackQuery({ text: 'Not allowed' });
      return;
    }

    const parts = data.split(':');
    const action = parts[0];
    const requestId = Number(parts[1]);
    if (!requestId || Number.isNaN(requestId)) {
      await ctx.answerCallbackQuery({ text: 'Invalid request ID' });
      return;
    }

    try {
      if (action === 'wd_paid') {
        await ctx.editMessageReplyMarkup({ reply_markup: confirmKeyboard(requestId, 'paid') });
        await ctx.answerCallbackQuery();
        return;
      }

      if (action === 'wd_cancel') {
        await ctx.editMessageReplyMarkup({ reply_markup: confirmKeyboard(requestId, 'cancel') });
        await ctx.answerCallbackQuery();
        return;
      }

      if (action === 'wd_back') {
        await ctx.editMessageReplyMarkup({ reply_markup: baseKeyboard(requestId) });
        await ctx.answerCallbackQuery();
        return;
      }

      if (action === 'wd_paid_confirm') {
        const updated = await markWithdrawRequestAwaitingTxLink(requestId);
        if (!updated) {
          await ctx.answerCallbackQuery({ text: 'Request not pending' });
          return;
        }

        await ctx.editMessageText(formatRequest(updated), {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: 'Cancel', callback_data: `wd_cancel:${requestId}` }]],
          },
        });
        await bot.api.sendMessage(
          env.WITHDRAW_ADMIN_CHAT_ID,
          `Request #${requestId} is awaiting tx link.\nSend:\n/wdtx ${requestId} https://...`,
        );
        await ctx.answerCallbackQuery({ text: 'Now send tx link with /wdtx' });
        return;
      }

      if (action === 'wd_cancel_confirm') {
        const cancelled = await cancelWithdrawRequest(requestId);
        if (!cancelled) {
          await ctx.answerCallbackQuery({ text: 'Request cannot be cancelled' });
          return;
        }
        await ctx.editMessageText(formatRequest(cancelled), { parse_mode: 'HTML' });
        await notifyOwner(cancelled.owner_id, `Your withdraw request #${requestId} was cancelled by admin.`);
        await ctx.answerCallbackQuery({ text: 'Cancelled' });
        return;
      }

      await ctx.answerCallbackQuery({ text: 'Unknown action' });
    } catch (err) {
      console.error('[withdraw-admin] Callback error:', err);
      await ctx.answerCallbackQuery({ text: 'Failed to process request' });
    }
  });

  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (!isWithdrawAdmin(ctx)) {
      await next();
      return;
    }

    // Accept either:
    // 1) /wdtx <requestId> <txLink>
    // 2) /wdtx@BotUsername <requestId> <txLink>
    // 3) plain URL message, if there is an awaiting request in admin chat.
    let requestId: number | null = null;
    let txLink: string | null = null;

    const cmdMatch = text.match(/^\/wdtx(?:@[A-Za-z0-9_]+)?\s+(\d+)\s+(\S+)$/);
    if (cmdMatch) {
      requestId = Number(cmdMatch[1]);
      txLink = cmdMatch[2].trim();
    } else {
      const maybeUrl = text.match(/https?:\/\/\S+/)?.[0] ?? null;
      if (!maybeUrl) {
        await next();
        return;
      }
      const awaiting = await getLatestAwaitingWithdrawRequestByAdminChat(env.WITHDRAW_ADMIN_CHAT_ID);
      if (!awaiting) {
        await ctx.reply('No withdraw request is waiting for a tx link.');
        return;
      }
      requestId = awaiting.id;
      txLink = maybeUrl.trim();
    }

    if (!requestId || !txLink) {
      await ctx.reply('Usage: /wdtx <requestId> <txLink>');
      return;
    }

    try {
      const parsed = new URL(txLink);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        await ctx.reply('Invalid URL protocol');
        return;
      }
    } catch {
      await ctx.reply('Invalid transaction URL');
      return;
    }

    try {
      const paid = await markWithdrawRequestPaid(requestId, txLink);
      if (!paid) {
        const existing = await getWithdrawRequestById(requestId);
        await ctx.reply(existing ? `Request status is ${existing.status}, cannot mark paid.` : 'Request not found.');
        return;
      }

      if (paid.admin_message_id) {
        await bot.api.editMessageText(paid.admin_chat_id, paid.admin_message_id, formatRequest(paid), {
          parse_mode: 'HTML',
        }).catch(() => {});
      }
      await notifyOwner(
        paid.owner_id,
        `Your withdraw request #${paid.id} has been paid.\nWallet: ${paid.wallet_address}\nTX: ${txLink}`,
      );
      await ctx.reply(`Marked request #${paid.id} as paid.`);
    } catch (err) {
      console.error('[withdraw-admin] /wdtx error:', err);
      await ctx.reply('Failed to save tx link');
    }
  });

  console.log('[bot] Withdraw admin handlers registered');
}
