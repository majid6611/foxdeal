import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { telegramAuth } from '../middleware/auth.js';
import {
  getActiveWithdrawRequest,
  cancelWithdrawRequest,
  createWithdrawRequest,
  getEarningsSummary,
  getEarningsHistory,
  getLatestWithdrawRequest,
  getWithdrawPreview,
  updateUserWallet,
} from '../../db/queries.js';
import { getUserByTelegramId, upsertUser } from '../../db/queries.js';
import { sendWithdrawRequestToAdmin } from '../../bot/withdrawAdmin.js';
import { env } from '../../config/env.js';

export const earningsRouter = Router();

earningsRouter.use(telegramAuth);

// GET /api/earnings — owner's earnings summary + history
earningsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.json({
        summary: {
          total_earned: 0,
          total_pending: 0,
          total_paid: 0,
          platform_fees: 0,
          available_to_withdraw: 0,
          next_payout_at: null,
          next_payout_amount: 0,
        },
        history: [],
        withdrawRequest: null,
        walletAddress: null,
        minWithdrawTon: env.MIN_WITHDRAW_TON,
        withdrawPreview: {
          gross_amount: 0,
          fee_percent: 0,
          fee_amount: 0,
          net_amount: 0,
        },
      });
      return;
    }

    const [summary, history, withdrawRequest, withdrawPreview] = await Promise.all([
      getEarningsSummary(user.id),
      getEarningsHistory(user.id),
      getLatestWithdrawRequest(user.id),
      getWithdrawPreview(user.id),
    ]);

    res.json({
      summary,
      history,
      withdrawRequest,
      walletAddress: user.wallet_address ?? null,
      minWithdrawTon: env.MIN_WITHDRAW_TON,
      withdrawPreview,
    });
  } catch (err) {
    console.error('[api] GET /earnings error:', err);
    res.status(500).json({ error: 'Failed to load earnings' });
  }
});

// POST /api/earnings/withdraw-request — lock available earnings and notify admin
earningsRouter.post('/withdraw-request', async (req: Request, res: Response) => {
  try {
    const user = await upsertUser(req.telegramUser!.id, 'owner');
    if (!user.wallet_address) {
      res.status(400).json({ error: 'Please save your payout wallet first' });
      return;
    }

    const request = await createWithdrawRequest(
      user.id,
      user.wallet_address,
      env.WITHDRAW_ADMIN_CHAT_ID,
      env.MIN_WITHDRAW_TON,
    );

    try {
      await sendWithdrawRequestToAdmin(request, req.telegramUser!.id);
    } catch (err) {
      await cancelWithdrawRequest(request.id).catch(() => {});
      console.error('[api] Failed to send withdraw request to admin:', err);
      res.status(500).json({ error: 'Failed to notify admin, please try again' });
      return;
    }

    res.json({ success: true, request });
  } catch (err) {
    const message = (err as Error).message || '';
    if (
      message.includes('active withdraw request')
      || message.includes('No withdrawable balance')
      || message.includes('Minimum withdraw amount')
    ) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('[api] POST /earnings/withdraw-request error:', err);
    res.status(500).json({ error: 'Failed to create withdraw request' });
  }
});

// GET /api/earnings/wallet — get current wallet address
earningsRouter.get('/wallet', async (req: Request, res: Response) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    res.json({ walletAddress: user?.wallet_address ?? null });
  } catch (err) {
    console.error('[api] GET /earnings/wallet error:', err);
    res.status(500).json({ error: 'Failed to load wallet' });
  }
});

// POST /api/earnings/wallet — save wallet address
earningsRouter.post('/wallet', async (req: Request, res: Response) => {
  try {
    const body = z.object({
      walletAddress: z.string().min(1).max(128),
    }).parse(req.body);

    const user = await upsertUser(req.telegramUser!.id, 'owner');
    const activeWithdraw = await getActiveWithdrawRequest(user.id);
    if (activeWithdraw) {
      res.status(409).json({ error: 'Wallet is locked while a withdraw request is active' });
      return;
    }
    const updated = await updateUserWallet(user.id, body.walletAddress);
    res.json({ walletAddress: updated.wallet_address });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid wallet address' });
      return;
    }
    console.error('[api] POST /earnings/wallet error:', err);
    res.status(500).json({ error: 'Failed to save wallet' });
  }
});
