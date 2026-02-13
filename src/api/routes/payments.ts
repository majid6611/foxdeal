import { Router } from 'express';
import { telegramAuth } from '../middleware/auth.js';
import { getDealById, getChannelById, getUserByTelegramId } from '../../db/queries.js';
import { createInvoiceLink } from '../../bot/payments.js';

export const paymentsRouter = Router();

paymentsRouter.use(telegramAuth);

// POST /api/deals/:id/pay — create an invoice link for inline payment in Mini App
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

    // Verify the current user is the advertiser
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

    // Create invoice link for Mini App
    const invoiceLink = await createInvoiceLink(
      deal.id,
      deal.price,
      channel.username,
    );

    res.json({ invoiceLink });
  } catch (err) {
    console.error('[api] POST /deals/:id/pay error:', err);
    res.status(500).json({ error: 'Failed to create payment invoice' });
  }
});
