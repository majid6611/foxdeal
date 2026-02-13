import { pool } from './index.js';
import type { User, Channel, Deal, Transaction, DealStatus, TransactionType, UserRole } from '../shared/types.js';

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
): Promise<Channel> {
  const { rows } = await pool.query<Channel>(
    `INSERT INTO channels (owner_id, telegram_channel_id, username, subscribers, category, price, duration_hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [ownerId, telegramChannelId, username, subscribers, category, price, durationHours],
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
    'SELECT * FROM channels WHERE is_active = TRUE ORDER BY subscribers DESC',
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

export async function deactivateChannel(channelId: number): Promise<void> {
  await pool.query(
    'UPDATE channels SET is_active = FALSE WHERE id = $1',
    [channelId],
  );
}

// ── Deals ────────────────────────────────────────────────────────────

export async function createDeal(
  advertiserId: number,
  channelId: number,
  adText: string,
  adImageUrl: string | null,
  durationHours: number,
  price: number,
): Promise<Deal> {
  const { rows } = await pool.query<Deal>(
    `INSERT INTO deals (advertiser_id, channel_id, ad_text, ad_image_url, duration_hours, price, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'created')
     RETURNING *`,
    [advertiserId, channelId, adText, adImageUrl, durationHours, price],
  );
  return rows[0];
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
