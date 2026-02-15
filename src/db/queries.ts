import { pool } from './index.js';
import type { User, Channel, Deal, Transaction, OwnerEarning, DealStatus, TransactionType, UserRole } from '../shared/types.js';

// ── Users ────────────────────────────────────────────────────────────

export async function upsertUser(telegramId: number, role: UserRole): Promise<User> {
  const { rows } = await pool.query<User>(
    `INSERT INTO users (telegram_id, role)
     VALUES ($1, $2)
     ON CONFLICT (telegram_id) DO UPDATE SET role = $2
     RETURNING *`,
    [telegramId, role],
  );
  return rows[0];
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const { rows } = await pool.query<User>(
    'SELECT * FROM users WHERE telegram_id = $1',
    [telegramId],
  );
  return rows[0] ?? null;
}

// ── Channels ─────────────────────────────────────────────────────────

export async function createChannel(
  ownerId: number,
  telegramChannelId: string,
  username: string,
  subscribers: number,
  category: string,
  price: number,
  durationHours: number,
  cpcPrice: number = 0,
  photoUrl: string | null = null,
): Promise<Channel> {
  const { rows } = await pool.query<Channel>(
    `INSERT INTO channels (owner_id, telegram_channel_id, username, subscribers, category, price, duration_hours, cpc_price, approval_status, photo_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
     RETURNING *`,
    [ownerId, telegramChannelId, username, subscribers, category, price, durationHours, cpcPrice, photoUrl],
  );
  return rows[0];
}

export async function getChannelById(id: number): Promise<Channel | null> {
  const { rows } = await pool.query<Channel>(
    'SELECT * FROM channels WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function getActiveChannels(): Promise<Channel[]> {
  const { rows } = await pool.query<Channel>(
    "SELECT * FROM channels WHERE is_active = TRUE AND approval_status = 'approved' ORDER BY subscribers DESC",
  );
  return rows;
}

export async function getChannelsByOwner(ownerId: number): Promise<Channel[]> {
  const { rows } = await pool.query<Channel>(
    'SELECT * FROM channels WHERE owner_id = $1 ORDER BY created_at DESC',
    [ownerId],
  );
  return rows;
}

export async function updateChannelBotAdmin(channelId: number, botIsAdmin: boolean): Promise<void> {
  await pool.query(
    'UPDATE channels SET bot_is_admin = $2 WHERE id = $1',
    [channelId, botIsAdmin],
  );
}

export async function updateChannelPhoto(channelId: number, photoUrl: string | null): Promise<void> {
  await pool.query(
    'UPDATE channels SET photo_url = $2 WHERE id = $1',
    [channelId, photoUrl],
  );
}

export async function deactivateChannel(channelId: number): Promise<void> {
  await pool.query(
    'UPDATE channels SET is_active = FALSE WHERE id = $1',
    [channelId],
  );
}

export async function activateChannel(channelId: number): Promise<void> {
  await pool.query(
    'UPDATE channels SET is_active = TRUE WHERE id = $1',
    [channelId],
  );
}

export async function approveChannel(channelId: number): Promise<Channel | null> {
  const { rows } = await pool.query<Channel>(
    "UPDATE channels SET approval_status = 'approved' WHERE id = $1 RETURNING *",
    [channelId],
  );
  return rows[0] ?? null;
}

export async function rejectChannel(channelId: number): Promise<Channel | null> {
  const { rows } = await pool.query<Channel>(
    "UPDATE channels SET approval_status = 'rejected', is_active = FALSE WHERE id = $1 RETURNING *",
    [channelId],
  );
  return rows[0] ?? null;
}

// ── Deals ────────────────────────────────────────────────────────────

export async function createDeal(
  advertiserId: number,
  channelId: number,
  adText: string,
  adImageUrl: string | null,
  adLink: string | null,
  durationHours: number,
  price: number,
  pricingModel: 'time' | 'cpc' = 'time',
  budget: number = 0,
): Promise<Deal> {
  const { rows } = await pool.query<Deal>(
    `INSERT INTO deals (advertiser_id, channel_id, ad_text, ad_image_url, ad_link, duration_hours, price, pricing_model, budget, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'created')
     RETURNING *`,
    [advertiserId, channelId, adText, adImageUrl, adLink, durationHours, price, pricingModel, budget],
  );
  return rows[0];
}

export async function incrementClickCount(dealId: number): Promise<number> {
  const { rows } = await pool.query<{ click_count: number }>(
    `UPDATE deals SET click_count = click_count + 1 WHERE id = $1 RETURNING click_count`,
    [dealId],
  );
  return rows[0]?.click_count ?? 0;
}

/**
 * For CPC deals: atomically increment click_count, add cpc cost to budget_spent.
 * Returns updated deal with budget info. Returns null if deal not found or not in 'posted' status.
 */
export async function spendClick(dealId: number, cpcPrice: number): Promise<Deal | null> {
  const { rows } = await pool.query<Deal>(
    `UPDATE deals
     SET click_count = click_count + 1,
         budget_spent = budget_spent + $2
     WHERE id = $1 AND status = 'posted' AND pricing_model = 'cpc'
     RETURNING *`,
    [dealId, cpcPrice],
  );
  return rows[0] ?? null;
}

/**
 * Get all CPC deals that have exhausted their budget (budget_spent >= budget)
 */
export async function getExhaustedCpcDeals(): Promise<Deal[]> {
  const { rows } = await pool.query<Deal>(
    `SELECT * FROM deals
     WHERE pricing_model = 'cpc'
       AND status = 'posted'
       AND budget_spent >= budget`,
  );
  return rows;
}


export async function getDealById(id: number): Promise<Deal | null> {
  const { rows } = await pool.query<Deal>(
    'SELECT * FROM deals WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function getDealsByAdvertiser(advertiserId: number): Promise<Deal[]> {
  const { rows } = await pool.query<Deal>(
    'SELECT * FROM deals WHERE advertiser_id = $1 ORDER BY created_at DESC',
    [advertiserId],
  );
  return rows;
}

export async function getDealsByChannel(channelId: number): Promise<Deal[]> {
  const { rows } = await pool.query<Deal>(
    'SELECT * FROM deals WHERE channel_id = $1 ORDER BY created_at DESC',
    [channelId],
  );
  return rows;
}

export async function getIncomingDealsForOwner(ownerId: number): Promise<Deal[]> {
  const { rows } = await pool.query<Deal>(
    `SELECT d.* FROM deals d
     JOIN channels c ON d.channel_id = c.id
     WHERE c.owner_id = $1
     ORDER BY d.created_at DESC`,
    [ownerId],
  );
  return rows;
}

export async function updateDealStatus(
  dealId: number,
  fromStatus: DealStatus,
  toStatus: DealStatus,
  extra?: Partial<Pick<Deal, 'posted_message_id' | 'posted_at' | 'verified_at' | 'paid_at' | 'completed_at' | 'rejection_reason'>>,
): Promise<Deal | null> {
  const setClauses = ['status = $3'];
  const values: unknown[] = [dealId, fromStatus, toStatus];
  let paramIndex = 4;

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
  }

  const { rows } = await pool.query<Deal>(
    `UPDATE deals
     SET ${setClauses.join(', ')}
     WHERE id = $1 AND status = $2
     RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function getExpiredApprovedDeals(timeoutHours: number): Promise<Deal[]> {
  const { rows } = await pool.query<Deal>(
    `SELECT * FROM deals
     WHERE status = 'approved'
     AND created_at < NOW() - INTERVAL '1 hour' * $1`,
    [timeoutHours],
  );
  return rows;
}

export async function getExpiredPendingDeals(timeoutHours: number): Promise<Deal[]> {
  const { rows } = await pool.query<Deal>(
    `SELECT * FROM deals
     WHERE status = 'pending_approval'
     AND created_at < NOW() - INTERVAL '1 hour' * $1`,
    [timeoutHours],
  );
  return rows;
}

// ── Transactions ─────────────────────────────────────────────────────

export async function createTransaction(
  dealId: number,
  type: TransactionType,
  amount: number,
  paymentMethod: string = 'telegram_stars',
): Promise<Transaction> {
  const { rows } = await pool.query<Transaction>(
    `INSERT INTO transactions (deal_id, type, amount, payment_method)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [dealId, type, amount, paymentMethod],
  );
  return rows[0];
}

export async function updateTransactionStatus(
  transactionId: number,
  status: 'completed' | 'failed',
): Promise<void> {
  await pool.query(
    'UPDATE transactions SET status = $2 WHERE id = $1',
    [transactionId, status],
  );
}

export async function getTransactionsByDeal(dealId: number): Promise<Transaction[]> {
  const { rows } = await pool.query<Transaction>(
    'SELECT * FROM transactions WHERE deal_id = $1 ORDER BY created_at DESC',
    [dealId],
  );
  return rows;
}

// ── Owner Earnings ──────────────────────────────────────────────────

const PLATFORM_FEE_PERCENT = 5;

export async function recordEarning(
  ownerId: number,
  dealId: number,
  channelId: number,
  grossAmount: number,
): Promise<OwnerEarning> {
  // Owner gets 95% rounded down; platform keeps the rest (5% rounded up)
  const netAmount = Math.floor(grossAmount * (100 - PLATFORM_FEE_PERCENT) / 100);
  const platformFee = grossAmount - netAmount;

  const { rows } = await pool.query<OwnerEarning>(
    `INSERT INTO owner_earnings (owner_id, deal_id, channel_id, gross_amount, platform_fee, net_amount)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [ownerId, dealId, channelId, grossAmount, platformFee, netAmount],
  );
  return rows[0];
}

export interface EarningsSummary {
  total_earned: number;
  total_pending: number;
  total_paid: number;
  platform_fees: number;
  next_payout_at: Date | null;
  next_payout_amount: number;
}

export async function getEarningsSummary(ownerId: number): Promise<EarningsSummary> {
  const { rows } = await pool.query<{
    total_earned: string;
    total_pending: string;
    total_paid: string;
    platform_fees: string;
    next_payout_at: Date | null;
    next_payout_amount: string;
  }>(
    `SELECT
       COALESCE(SUM(net_amount), 0) AS total_earned,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN net_amount END), 0) AS total_pending,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN net_amount END), 0) AS total_paid,
       COALESCE(SUM(platform_fee), 0) AS platform_fees,
       MIN(CASE WHEN status = 'pending' THEN payout_at END) AS next_payout_at,
       COALESCE(SUM(CASE WHEN status = 'pending' AND payout_at <= (SELECT MIN(payout_at) FROM owner_earnings WHERE owner_id = $1 AND status = 'pending') + INTERVAL '1 day' THEN net_amount END), 0) AS next_payout_amount
     FROM owner_earnings
     WHERE owner_id = $1`,
    [ownerId],
  );

  const r = rows[0];
  return {
    total_earned: Number(r.total_earned),
    total_pending: Number(r.total_pending),
    total_paid: Number(r.total_paid),
    platform_fees: Number(r.platform_fees),
    next_payout_at: r.next_payout_at,
    next_payout_amount: Number(r.next_payout_amount),
  };
}

export async function getEarningsHistory(ownerId: number): Promise<(OwnerEarning & { channel_username: string })[]> {
  const { rows } = await pool.query<OwnerEarning & { channel_username: string }>(
    `SELECT e.*, c.username AS channel_username
     FROM owner_earnings e
     JOIN channels c ON e.channel_id = c.id
     WHERE e.owner_id = $1
     ORDER BY e.earned_at DESC
     LIMIT 50`,
    [ownerId],
  );
  return rows;
}

// ── Unique Click Tracking ───────────────────────────────────────────

/**
 * Record a unique visitor click using a hash of IP + User-Agent.
 * Returns true if inserted (new visitor), false if duplicate.
 */
export async function recordVisitorClick(dealId: number, visitorHash: string): Promise<boolean> {
  try {
    await pool.query(
      'INSERT INTO deal_clicks (deal_id, visitor_hash) VALUES ($1, $2)',
      [dealId, visitorHash],
    );
    return true;
  } catch (err) {
    // Unique constraint violation = duplicate click
    if ((err as any)?.code === '23505') {
      return false;
    }
    throw err;
  }
}

/**
 * Get the number of unique clicks for a deal.
 */
export async function getUniqueClickCount(dealId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM deal_clicks WHERE deal_id = $1',
    [dealId],
  );
  return Number(rows[0].count);
}
