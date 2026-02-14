import { Router, type Request, type Response } from 'express';
import { telegramAuth } from '../middleware/auth.js';
import { getEarningsSummary, getEarningsHistory } from '../../db/queries.js';
import { getUserByTelegramId } from '../../db/queries.js';

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

    res.json({ summary, history });
  } catch (err) {
    console.error('[api] GET /earnings error:', err);
    res.status(500).json({ error: 'Failed to load earnings' });
  }
});
