import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { telegramAuth } from '../middleware/auth.js';
import { getEarningsSummary, getEarningsHistory, updateUserWallet } from '../../db/queries.js';
import { getUserByTelegramId, upsertUser } from '../../db/queries.js';

export const earningsRouter = Router();

earningsRouter.use(telegramAuth);

// GET /api/earnings — owner's earnings summary + history
earningsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = await getUserByTelegramId(req.telegramUser!.id);
    if (!user) {
      res.json({ summary: { total_earned: 0, total_pending: 0, total_paid: 0, platform_fees: 0, next_payout_at: null, next_payout_amount: 0 }, history: [] });
      return;
    }

    const [summary, history] = await Promise.all([
      getEarningsSummary(user.id),
      getEarningsHistory(user.id),
    ]);

    res.json({ summary, history, walletAddress: user.wallet_address ?? null });
  } catch (err) {
    console.error('[api] GET /earnings error:', err);
    res.status(500).json({ error: 'Failed to load earnings' });
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
