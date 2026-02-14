import { Router } from 'express';
import { telegramAuth } from '../middleware/auth.js';
import { getDealById, getChannelById, getUserByTelegramId } from '../../db/queries.js';
import { holdEscrow } from '../../escrow/transitions.js';
import { autoPostDeal } from '../../bot/jobs.js';
import { env } from '../../config/env.js';
// TODO: restore real Stars payment after demo
// import { createInvoiceLink } from '../../bot/payments.js';

export const paymentsRouter = Router();

paymentsRouter.use(telegramAuth);

const TONCENTER_BASE = () =>
  env.TON_NETWORK === 'testnet'
    ? 'https://testnet.toncenter.com/api/v2'
    : 'https://toncenter.com/api/v2';

// POST /api/deals/:id/pay — return TON payment details for the deal
paymentsRouter.post('/deals/:id/pay', async (req, res) => {
  try {
    const deal = await getDealById(Number(req.params.id));
    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    if (deal.status !== 'approved') {
      res.status(400).json({ error: 'Deal must be in approved state to pay' });
      return;
    }

    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user || user.id !== deal.advertiser_id) {
      res.status(403).json({ error: 'Only the advertiser can pay for this deal' });
      return;
    }

    const channel = await getChannelById(deal.channel_id);
    if (!channel) {
      res.status(400).json({ error: 'Channel not found' });
      return;
    }

    const tonAmount = deal.price;
    const comment = `foxdeal_${deal.id}`;

    res.json({
      tonPayment: {
        walletAddress: env.TON_WALLET_ADDRESS,
        amount: tonAmount,
        amountNano: Math.round(tonAmount * 1e9).toString(),
        comment,
        dealId: deal.id,
        network: env.TON_NETWORK,
      },
    });
  } catch (err) {
    console.error('[api] POST /deals/:id/pay error:', err);
    res.status(500).json({ error: 'Failed to prepare payment' });
  }
});

// POST /api/deals/:id/confirm-payment — verify TON transaction via TonCenter and process deal
paymentsRouter.post('/deals/:id/confirm-payment', async (req, res) => {
  try {
    const deal = await getDealById(Number(req.params.id));
    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    if (deal.status !== 'approved') {
      res.status(400).json({ error: 'Deal is not awaiting payment' });
      return;
    }

    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user || user.id !== deal.advertiser_id) {
      res.status(403).json({ error: 'Only the advertiser can confirm payment' });
      return;
    }

    // TODO: For production, restore TonCenter verification:
    //   const expectedComment = `foxdeal_${deal.id}`;
    //   const expectedNano = Math.round(deal.price * 1e9);
    //   const verified = await pollForTransaction(expectedComment, expectedNano);
    //   if (!verified) { res.status(402).json({ error: 'Transaction not found yet.' }); return; }
    // Demo mode: skip verification, accept immediately
    await holdEscrow(deal.id, deal.price);
    console.log(`[payments] Escrow held for deal ${deal.id} (demo mode — no TON verification)`);

    autoPostDeal(deal.id).catch((err) =>
      console.error(`[payments] Error auto-posting deal ${deal.id}:`, err),
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[api] POST /deals/:id/confirm-payment error:', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

/**
 * Poll TonCenter API for a matching incoming transaction to our wallet.
 * Retries a few times with delays to account for blockchain confirmation time.
 */
async function pollForTransaction(
  expectedComment: string,
  expectedNano: number,
  maxAttempts = 5,
  delayMs = 3000,
): Promise<boolean> {
  if (!env.TON_API_KEY || !env.TON_WALLET_ADDRESS) {
    console.warn('[payments] TON_API_KEY or TON_WALLET_ADDRESS not set, skipping verification');
    return true;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const url = `${TONCENTER_BASE()}/getTransactions?` +
        `address=${encodeURIComponent(env.TON_WALLET_ADDRESS)}&limit=20` +
        `&api_key=${env.TON_API_KEY}`;

      const resp = await fetch(url);

      if (!resp.ok) {
        console.warn(`[payments] TonCenter API returned ${resp.status} on attempt ${attempt}`);
        if (attempt < maxAttempts) {
          await sleep(delayMs);
          continue;
        }
        return false;
      }

      const data = await resp.json();
      const transactions = data.result ?? [];

      for (const tx of transactions) {
        const msg = tx.in_msg;
        if (!msg) continue;

        // TonCenter returns the comment in msg.message (decoded text)
        const comment = msg.message || '';
        const value = Number(msg.value || 0);

        if (comment === expectedComment && value >= expectedNano * 0.95) {
          console.log(
            `[payments] ✅ Verified TON tx: comment="${comment}", ` +
            `value=${value} nanoTON (expected ${expectedNano}), ` +
            `from=${msg.source}, attempt=${attempt}`,
          );
          return true;
        }
      }

      console.log(
        `[payments] Attempt ${attempt}/${maxAttempts}: no matching tx yet ` +
        `(comment="${expectedComment}", checked ${transactions.length} txs)`,
      );

      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    } catch (err) {
      console.error(`[payments] TonCenter poll error (attempt ${attempt}):`, err);
      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
