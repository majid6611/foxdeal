import { pool } from './index.js';
import type {
  User,
  Channel,
  Deal,
  Campaign,
  CampaignItem,
  Transaction,
  OwnerEarning,
  ChannelRating,
  AdvertiserRating,
  DealStatus,
  TransactionType,
  UserRole,
  WithdrawRequest,
  WithdrawRequestStatus,
} from '../shared/types.js';
import { calculateFeeBreakdown, getPlatformFeePercent } from '../shared/fees.js';

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

/**
 * Ensure a user row exists when they interact with the bot (/start).
 * Creates a new row with default role 'advertiser' if missing, but never overrides existing role.
 */
export async function ensureUserByTelegramId(telegramId: number, username: string | null = null): Promise<User> {
  const { rows } = await pool.query<User>(
    `INSERT INTO users (telegram_id, role, username)
     VALUES ($1, 'advertiser', $2)
     ON CONFLICT (telegram_id) DO UPDATE
       SET telegram_id = EXCLUDED.telegram_id,
           username = COALESCE(EXCLUDED.username, users.username)
     RETURNING *`,
    [telegramId, username],
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

export async function updateUserWallet(userId: number, walletAddress: string | null): Promise<User> {
  const { rows } = await pool.query<User>(
    'UPDATE users SET wallet_address = $2 WHERE id = $1 RETURNING *',
    [userId, walletAddress],
  );
  return rows[0];
}

// ── Channels ─────────────────────────────────────────────────────────

export async function createChannel(
  ownerId: number,
  telegramChannelId: string,
  username: string,
  subscribers: number,
  avgPostViews: number | null,
  mostUsedLanguage: string | null,
  category: string,
  price: number,
  durationHours: number,
  cpcPrice: number = 0,
  photoUrl: string | null = null,
): Promise<Channel> {
  const { rows } = await pool.query<Channel>(
    `INSERT INTO channels (owner_id, telegram_channel_id, username, subscribers, avg_post_views, most_used_language, category, price, duration_hours, cpc_price, is_active, approval_status, photo_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, 'pending', $11)
     RETURNING *, 0::int AS completed_deals_count`,
    [ownerId, telegramChannelId, username, subscribers, avgPostViews, mostUsedLanguage, category, price, durationHours, cpcPrice, photoUrl],
  );
  return rows[0];
}

export async function getChannelById(id: number): Promise<Channel | null> {
  const { rows } = await pool.query<Channel>(
    `SELECT
      c.*,
      COALESCE(dc.completed_deals_count, 0)::int AS completed_deals_count
     FROM channels c
     LEFT JOIN (
       SELECT channel_id, COUNT(*)::int AS completed_deals_count
       FROM deals
       WHERE status = 'completed'
       GROUP BY channel_id
     ) dc ON dc.channel_id = c.id
     WHERE c.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface ActiveChannelFilters {
  category?: string;
  minSubscribers?: number;
  minAvgViews?: number;
  minStars?: number;
  favoriteOnly?: boolean;
  favoriteUserId?: number;
}

export interface ChannelSearchResult {
  items: Channel[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export async function getActiveChannels(filters: ActiveChannelFilters = {}): Promise<Channel[]> {
  const conditions = ['c.is_active = TRUE', `c.approval_status = 'approved'`];
  const values: Array<string | number> = [];

  if (filters.category) {
    values.push(filters.category);
    conditions.push(`c.category = $${values.length}`);
  }

  if (typeof filters.minSubscribers === 'number') {
    values.push(filters.minSubscribers);
    conditions.push(`c.subscribers >= $${values.length}`);
  }

  if (typeof filters.minAvgViews === 'number') {
    values.push(filters.minAvgViews);
    conditions.push(`COALESCE(c.avg_post_views, 0) >= $${values.length}`);
  }

  if (typeof filters.minStars === 'number') {
    values.push(filters.minStars);
    conditions.push(`COALESCE(c.rating_avg, 0) >= $${values.length}`);
  }

  if (filters.favoriteOnly && typeof filters.favoriteUserId === 'number') {
    values.push(filters.favoriteUserId);
    conditions.push(`EXISTS (
      SELECT 1
      FROM favorite_channels f
      WHERE f.user_id = $${values.length}
        AND f.channel_id = c.id
    )`);
  }

  const { rows } = await pool.query<Channel>(
    `SELECT
      c.*,
      COALESCE(dc.completed_deals_count, 0)::int AS completed_deals_count
     FROM channels c
     LEFT JOIN (
       SELECT channel_id, COUNT(*)::int AS completed_deals_count
       FROM deals
       WHERE status = 'completed'
       GROUP BY channel_id
     ) dc ON dc.channel_id = c.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.subscribers DESC`,
    values,
  );
  return rows;
}

export async function searchActiveChannels(
  filters: ActiveChannelFilters = {},
  page: number = 1,
  limit: number = 15,
): Promise<ChannelSearchResult> {
  const conditions = ['c.is_active = TRUE', `c.approval_status = 'approved'`];
  const filterValues: Array<string | number> = [];

  if (filters.category) {
    filterValues.push(filters.category);
    conditions.push(`c.category = $${filterValues.length}`);
  }

  if (typeof filters.minSubscribers === 'number') {
    filterValues.push(filters.minSubscribers);
    conditions.push(`c.subscribers >= $${filterValues.length}`);
  }

  if (typeof filters.minAvgViews === 'number') {
    filterValues.push(filters.minAvgViews);
    conditions.push(`COALESCE(c.avg_post_views, 0) >= $${filterValues.length}`);
  }

  if (typeof filters.minStars === 'number') {
    filterValues.push(filters.minStars);
    conditions.push(`COALESCE(c.rating_avg, 0) >= $${filterValues.length}`);
  }

  if (filters.favoriteOnly && typeof filters.favoriteUserId === 'number') {
    filterValues.push(filters.favoriteUserId);
    conditions.push(`EXISTS (
      SELECT 1
      FROM favorite_channels f
      WHERE f.user_id = $${filterValues.length}
        AND f.channel_id = c.id
    )`);
  }

  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const safePage = Math.max(1, Math.floor(page));
  const offset = (safePage - 1) * safeLimit;
  const whereClause = conditions.join(' AND ');

  const countRes = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::bigint AS total
     FROM channels c
     WHERE ${whereClause}`,
    filterValues,
  );
  const total = Number(countRes.rows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  const orderClause = filters.category
    ? 'c.subscribers DESC'
    : `(COALESCE(c.rating_avg, 0) * 100 + COALESCE(c.rating_count, 0)) DESC,
       COALESCE(c.rating_count, 0) DESC,
       c.subscribers DESC`;

  const dataValues = [...filterValues, safeLimit, offset];
  const { rows } = await pool.query<Channel>(
    `SELECT
      c.*,
      COALESCE(dc.completed_deals_count, 0)::int AS completed_deals_count
     FROM channels c
     LEFT JOIN (
       SELECT channel_id, COUNT(*)::int AS completed_deals_count
       FROM deals
       WHERE status = 'completed'
       GROUP BY channel_id
     ) dc ON dc.channel_id = c.id
     WHERE ${whereClause}
     ORDER BY ${orderClause}
     LIMIT $${filterValues.length + 1}
     OFFSET $${filterValues.length + 2}`,
    dataValues,
  );

  return {
    items: rows,
    total,
    page: safePage,
    limit: safeLimit,
    total_pages: totalPages,
  };
}

export async function getChannelsByOwner(ownerId: number): Promise<Channel[]> {
  const { rows } = await pool.query<Channel>(
    `SELECT
      c.*,
      COALESCE(dc.completed_deals_count, 0)::int AS completed_deals_count,
      COALESCE(es.earned_net, 0)::double precision AS earned_net
     FROM channels c
     LEFT JOIN (
       SELECT c2.id AS channel_id, COUNT(d.id)::int AS completed_deals_count
       FROM channels c2
       LEFT JOIN deals d
         ON d.channel_id = c2.id
        AND d.status = 'completed'
       WHERE c2.owner_id = $1
       GROUP BY c2.id
     ) dc ON dc.channel_id = c.id
     LEFT JOIN (
       SELECT channel_id, SUM(net_amount)::double precision AS earned_net
       FROM owner_earnings
       WHERE owner_id = $1
       GROUP BY channel_id
     ) es ON es.channel_id = c.id
     WHERE c.owner_id = $1
     ORDER BY c.created_at DESC`,
    [ownerId],
  );
  return rows;
}

export async function getFavoriteChannelIds(userId: number): Promise<number[]> {
  const { rows } = await pool.query<{ channel_id: number }>(
    'SELECT channel_id FROM favorite_channels WHERE user_id = $1',
    [userId],
  );
  return rows.map((row) => row.channel_id);
}

export async function getFavoriteChannelsByUser(userId: number): Promise<Channel[]> {
  const { rows } = await pool.query<Channel>(
    `SELECT
      c.*,
      COALESCE(dc.completed_deals_count, 0)::int AS completed_deals_count,
      TRUE AS is_favorite
     FROM favorite_channels f
     JOIN channels c ON c.id = f.channel_id
     LEFT JOIN (
       SELECT channel_id, COUNT(*)::int AS completed_deals_count
       FROM deals
       WHERE status = 'completed'
       GROUP BY channel_id
     ) dc ON dc.channel_id = c.id
     WHERE f.user_id = $1
       AND c.is_active = TRUE
       AND c.approval_status = 'approved'
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function addFavoriteChannel(userId: number, channelId: number): Promise<void> {
  await pool.query(
    `INSERT INTO favorite_channels (user_id, channel_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, channel_id) DO NOTHING`,
    [userId, channelId],
  );
}

export async function removeFavoriteChannel(userId: number, channelId: number): Promise<void> {
  await pool.query(
    'DELETE FROM favorite_channels WHERE user_id = $1 AND channel_id = $2',
    [userId, channelId],
  );
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

export async function updateChannelSnapshot(
  channelId: number,
  subscribers: number,
  photoUrl: string | null,
): Promise<void> {
  await pool.query(
    'UPDATE channels SET subscribers = $2, photo_url = $3 WHERE id = $1',
    [channelId, subscribers, photoUrl],
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
    "UPDATE channels SET approval_status = 'approved', is_active = TRUE WHERE id = $1 RETURNING *, 0::int AS completed_deals_count",
    [channelId],
  );
  return rows[0] ?? null;
}

export async function rejectChannel(channelId: number): Promise<Channel | null> {
  const { rows } = await pool.query<Channel>(
    "UPDATE channels SET approval_status = 'rejected', is_active = FALSE WHERE id = $1 RETURNING *, 0::int AS completed_deals_count",
    [channelId],
  );
  return rows[0] ?? null;
}

export async function resubmitRejectedChannel(
  channelId: number,
  ownerId: number,
  updates: {
    username: string;
    subscribers: number;
    avgPostViews: number | null;
    mostUsedLanguage: string | null;
    category: string;
    price: number;
    durationHours: number;
    cpcPrice: number;
    photoUrl: string | null;
  },
): Promise<Channel | null> {
  const { rows } = await pool.query<Channel>(
    `UPDATE channels
     SET username = $3,
         subscribers = $4,
         avg_post_views = $5,
         most_used_language = $6,
         category = $7,
         price = $8,
         duration_hours = $9,
         cpc_price = $10,
         photo_url = $11,
         bot_is_admin = TRUE,
         approval_status = 'pending',
         is_active = FALSE
     WHERE id = $1
       AND owner_id = $2
       AND approval_status = 'rejected'
     RETURNING *, 0::int AS completed_deals_count`,
    [
      channelId,
      ownerId,
      updates.username,
      updates.subscribers,
      updates.avgPostViews,
      updates.mostUsedLanguage,
      updates.category,
      updates.price,
      updates.durationHours,
      updates.cpcPrice,
      updates.photoUrl,
    ],
  );
  return rows[0] ?? null;
}

export async function removeRejectedChannel(channelId: number, ownerId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM channels
     WHERE id = $1
       AND owner_id = $2
       AND approval_status = 'rejected'`,
    [channelId, ownerId],
  );
  return (rowCount ?? 0) > 0;
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
  buttonText: string = '🔗 Learn More',
): Promise<Deal> {
  const { rows } = await pool.query<Deal>(
    `INSERT INTO deals (advertiser_id, channel_id, ad_text, ad_image_url, ad_link, duration_hours, price, pricing_model, budget, button_text, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'created')
     RETURNING *`,
    [advertiserId, channelId, adText, adImageUrl, adLink, durationHours, price, pricingModel, budget, buttonText],
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
    `SELECT
      d.*,
      c.id AS campaign_id,
      c.title AS campaign_title
     FROM deals d
     LEFT JOIN campaign_items ci ON ci.deal_id = d.id
     LEFT JOIN campaigns c ON c.id = ci.campaign_id
     WHERE d.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getTimeDealsForViewSync(): Promise<(Deal & { channel_username: string })[]> {
  const { rows } = await pool.query<Deal & { channel_username: string }>(
    `SELECT d.*, c.username AS channel_username
     FROM deals d
     JOIN channels c ON d.channel_id = c.id
     WHERE d.pricing_model = 'time'
       AND d.status IN ('posted', 'verified', 'completed')
       AND d.posted_message_id IS NOT NULL
       AND c.username IS NOT NULL
       AND c.username <> ''
     ORDER BY d.id DESC`,
  );
  return rows;
}

export async function updateDealViewSnapshot(
  dealId: number,
  adViews: number | null,
): Promise<void> {
  await pool.query(
    `UPDATE deals
     SET ad_views = COALESCE($2, ad_views),
         ad_views_checked_at = NOW()
     WHERE id = $1`,
    [dealId, adViews],
  );
}

export async function hasChannelRatingForDeal(dealId: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM channel_ratings WHERE deal_id = $1',
    [dealId],
  );
  return rows.length > 0;
}

export async function hasAdvertiserRatingForDeal(dealId: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM advertiser_ratings WHERE deal_id = $1',
    [dealId],
  );
  return rows.length > 0;
}

/**
 * Submit a 1-5 star rating for a completed deal.
 * Returns null if deal is not eligible or already rated.
 */
export async function submitChannelRating(
  dealId: number,
  advertiserId: number,
  score: number,
): Promise<ChannelRating | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: dealRows } = await client.query<Deal>(
      `SELECT * FROM deals
       WHERE id = $1
         AND advertiser_id = $2
         AND status = 'completed'`,
      [dealId, advertiserId],
    );
    const deal = dealRows[0];
    if (!deal) {
      await client.query('ROLLBACK');
      return null;
    }

    const { rows: ratingRows } = await client.query<ChannelRating>(
      `INSERT INTO channel_ratings (deal_id, channel_id, advertiser_id, score)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (deal_id) DO NOTHING
       RETURNING *`,
      [dealId, deal.channel_id, advertiserId, score],
    );
    const rating = ratingRows[0] ?? null;
    if (!rating) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE channels c
       SET rating_avg = agg.avg_score,
           rating_count = agg.cnt
       FROM (
         SELECT
           channel_id,
           COALESCE(ROUND(AVG(score)::numeric, 2), 0) AS avg_score,
           COUNT(*)::int AS cnt
         FROM channel_ratings
         WHERE channel_id = $1
         GROUP BY channel_id
       ) agg
       WHERE c.id = agg.channel_id`,
      [deal.channel_id],
    );

    await client.query('COMMIT');
    return rating;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Submit a 1-5 star rating for an advertiser (from channel owner) on a completed deal.
 * Returns null if deal is not eligible or already rated.
 */
export async function submitAdvertiserRating(
  dealId: number,
  ownerId: number,
  score: number,
): Promise<AdvertiserRating | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: dealRows } = await client.query<Deal>(
      `SELECT d.*
       FROM deals d
       JOIN channels c ON c.id = d.channel_id
       WHERE d.id = $1
         AND c.owner_id = $2
         AND d.status = 'completed'`,
      [dealId, ownerId],
    );
    const deal = dealRows[0];
    if (!deal) {
      await client.query('ROLLBACK');
      return null;
    }

    const { rows: ratingRows } = await client.query<AdvertiserRating>(
      `INSERT INTO advertiser_ratings (deal_id, advertiser_id, owner_id, score)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (deal_id) DO NOTHING
       RETURNING *`,
      [dealId, deal.advertiser_id, ownerId, score],
    );
    const rating = ratingRows[0] ?? null;
    if (!rating) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE users u
       SET advertiser_rating_avg = agg.avg_score,
           advertiser_rating_count = agg.cnt
       FROM (
         SELECT
           advertiser_id,
           COALESCE(ROUND(AVG(score)::numeric, 2), 0) AS avg_score,
           COUNT(*)::int AS cnt
         FROM advertiser_ratings
         WHERE advertiser_id = $1
         GROUP BY advertiser_id
       ) agg
       WHERE u.id = agg.advertiser_id`,
      [deal.advertiser_id],
    );

    await client.query('COMMIT');
    return rating;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getAdvertiserRatingSummary(
  advertiserId: number,
): Promise<{ rating_avg: number; rating_count: number }> {
  const { rows } = await pool.query<{ advertiser_rating_avg: string; advertiser_rating_count: number }>(
    `SELECT advertiser_rating_avg, advertiser_rating_count
     FROM users
     WHERE id = $1`,
    [advertiserId],
  );
  if (!rows[0]) {
    return { rating_avg: 0, rating_count: 0 };
  }
  return {
    rating_avg: Number(rows[0].advertiser_rating_avg ?? 0),
    rating_count: Number(rows[0].advertiser_rating_count ?? 0),
  };
}

export async function getDealsByAdvertiser(advertiserId: number): Promise<Deal[]> {
  const { rows } = await pool.query<Deal>(
    `SELECT
      d.*,
      c.id AS campaign_id,
      c.title AS campaign_title
     FROM deals d
     LEFT JOIN campaign_items ci ON ci.deal_id = d.id
     LEFT JOIN campaigns c ON c.id = ci.campaign_id
     WHERE d.advertiser_id = $1
     ORDER BY d.created_at DESC`,
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
    `SELECT
      d.*,
      c2.id AS campaign_id,
      c2.title AS campaign_title
     FROM deals d
     JOIN channels c ON d.channel_id = c.id
     LEFT JOIN campaign_items ci ON ci.deal_id = d.id
     LEFT JOIN campaigns c2 ON c2.id = ci.campaign_id
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
     AND updated_at < NOW() - INTERVAL '1 hour' * $1`,
    [timeoutHours],
  );
  return rows;
}

export async function getExpiredPendingDeals(timeoutHours: number): Promise<Deal[]> {
  const { rows } = await pool.query<Deal>(
    `SELECT * FROM deals
     WHERE status = 'pending_approval'
     AND updated_at < NOW() - INTERVAL '1 hour' * $1`,
    [timeoutHours],
  );
  return rows;
}

// ── Campaigns ───────────────────────────────────────────────────────

export interface CampaignListItem extends Campaign {
  items_total: number;
  approved: number;
  paid: number;
  posted: number;
  rejected: number;
  expired: number;
}

export interface CampaignItemDetail extends CampaignItem {
  channel_username: string;
  channel_category: string;
  channel_subscribers: number;
  deal_status: string | null;
  ad_views: number | null;
  status: string;
}

function mapDealStatusToCampaignStatus(dealStatus: string | null): string {
  if (!dealStatus) return 'draft';
  if (dealStatus === 'created' || dealStatus === 'pending_admin' || dealStatus === 'pending_approval') return 'waiting_approval';
  if (dealStatus === 'approved') return 'approved';
  if (dealStatus === 'escrow_held') return 'paid';
  if (dealStatus === 'posted' || dealStatus === 'verified' || dealStatus === 'completed') return 'posted';
  if (dealStatus === 'rejected') return 'rejected';
  if (dealStatus === 'cancelled') return 'cancelled';
  if (dealStatus === 'expired' || dealStatus === 'refunded' || dealStatus === 'disputed') return 'expired';
  return dealStatus;
}

export async function createCampaign(
  advertiserUserId: number,
  title: string | null,
  adText: string,
  adImageUrl: string | null,
  adLink: string | null,
  buttonText: string | null,
): Promise<Campaign> {
  const { rows } = await pool.query<Campaign>(
    `INSERT INTO campaigns (advertiser_user_id, title, ad_text, ad_image_url, ad_link, button_text)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [advertiserUserId, title, adText, adImageUrl, adLink, buttonText],
  );
  return rows[0];
}

export async function getCampaignById(campaignId: number): Promise<Campaign | null> {
  const { rows } = await pool.query<Campaign>(
    'SELECT * FROM campaigns WHERE id = $1',
    [campaignId],
  );
  return rows[0] ?? null;
}

export async function getCampaignByIdForAdvertiser(
  campaignId: number,
  advertiserUserId: number,
): Promise<Campaign | null> {
  const { rows } = await pool.query<Campaign>(
    'SELECT * FROM campaigns WHERE id = $1 AND advertiser_user_id = $2',
    [campaignId, advertiserUserId],
  );
  return rows[0] ?? null;
}

export async function createCampaignItem(
  campaignId: number,
  channelId: number,
  dealId: number,
  status: string,
): Promise<CampaignItem> {
  const { rows } = await pool.query<CampaignItem>(
    `INSERT INTO campaign_items (campaign_id, channel_id, deal_id, status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [campaignId, channelId, dealId, status],
  );
  return rows[0];
}

export async function getCampaignsByAdvertiser(advertiserUserId: number): Promise<CampaignListItem[]> {
  const { rows } = await pool.query<{
    id: number;
    advertiser_user_id: number;
    title: string | null;
    ad_text: string;
    ad_image_url: string | null;
    ad_link: string | null;
    button_text: string | null;
    status: 'active' | 'completed' | 'cancelled';
    created_at: Date;
    updated_at: Date;
    items_total: string;
    approved: string;
    paid: string;
    posted: string;
    rejected: string;
    expired: string;
  }>(
    `SELECT
      c.*,
      COUNT(ci.id)::int AS items_total,
      COUNT(*) FILTER (WHERE d.status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE d.status = 'escrow_held')::int AS paid,
      COUNT(*) FILTER (WHERE d.status IN ('posted', 'verified', 'completed'))::int AS posted,
      COUNT(*) FILTER (WHERE d.status IN ('rejected', 'cancelled'))::int AS rejected,
      COUNT(*) FILTER (WHERE d.status IN ('expired', 'refunded', 'disputed'))::int AS expired
     FROM campaigns c
     LEFT JOIN campaign_items ci ON ci.campaign_id = c.id
     LEFT JOIN deals d ON d.id = ci.deal_id
     WHERE c.advertiser_user_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [advertiserUserId],
  );

  return rows.map((row) => ({
    ...row,
    items_total: Number(row.items_total),
    approved: Number(row.approved),
    paid: Number(row.paid),
    posted: Number(row.posted),
    rejected: Number(row.rejected),
    expired: Number(row.expired),
  }));
}

export async function getCampaignItems(campaignId: number): Promise<CampaignItemDetail[]> {
  const { rows } = await pool.query<{
    id: number;
    campaign_id: number;
    channel_id: number;
    deal_id: number | null;
    stored_status: string;
    created_at: Date;
    updated_at: Date;
    channel_username: string;
    channel_category: string;
    channel_subscribers: number;
    deal_status: string | null;
    ad_views: number | null;
  }>(
    `SELECT
      ci.id,
      ci.campaign_id,
      ci.channel_id,
      ci.deal_id,
      ci.status AS stored_status,
      ci.created_at,
      ci.updated_at,
      c.username AS channel_username,
      c.category AS channel_category,
      c.subscribers AS channel_subscribers,
      d.status AS deal_status,
      d.ad_views AS ad_views
     FROM campaign_items ci
     JOIN channels c ON c.id = ci.channel_id
     LEFT JOIN deals d ON d.id = ci.deal_id
     WHERE ci.campaign_id = $1
     ORDER BY ci.created_at ASC`,
    [campaignId],
  );

  return rows.map((row) => ({
    id: row.id,
    campaign_id: row.campaign_id,
    channel_id: row.channel_id,
    deal_id: row.deal_id,
    status: mapDealStatusToCampaignStatus(row.deal_status ?? row.stored_status),
    created_at: row.created_at,
    updated_at: row.updated_at,
    channel_username: row.channel_username,
    channel_category: row.channel_category,
    channel_subscribers: row.channel_subscribers,
    deal_status: row.deal_status,
    ad_views: row.ad_views,
  }));
}

export async function getCampaignItemByIdForAdvertiser(
  itemId: number,
  advertiserUserId: number,
): Promise<(CampaignItem & { deal_status: string | null }) | null> {
  const { rows } = await pool.query<CampaignItem & { deal_status: string | null }>(
    `SELECT ci.*, d.status AS deal_status
     FROM campaign_items ci
     JOIN campaigns c ON c.id = ci.campaign_id
     LEFT JOIN deals d ON d.id = ci.deal_id
     WHERE ci.id = $1 AND c.advertiser_user_id = $2`,
    [itemId, advertiserUserId],
  );
  return rows[0] ?? null;
}

export async function deleteCampaignItem(itemId: number): Promise<void> {
  await pool.query('DELETE FROM campaign_items WHERE id = $1', [itemId]);
}

export async function updateCampaignStatus(
  campaignId: number,
  status: 'active' | 'completed' | 'cancelled',
): Promise<Campaign | null> {
  const { rows } = await pool.query<Campaign>(
    'UPDATE campaigns SET status = $2 WHERE id = $1 RETURNING *',
    [campaignId, status],
  );
  return rows[0] ?? null;
}

export async function deleteCampaign(campaignId: number): Promise<void> {
  await pool.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
}

export async function getCampaignDealIds(campaignId: number): Promise<number[]> {
  const { rows } = await pool.query<{ deal_id: number }>(
    `SELECT deal_id
     FROM campaign_items
     WHERE campaign_id = $1 AND deal_id IS NOT NULL`,
    [campaignId],
  );
  return rows.map((r) => r.deal_id);
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

export async function recordEarning(
  ownerId: number,
  dealId: number,
  channelId: number,
  grossAmount: number,
): Promise<OwnerEarning> {
  const split = calculateFeeBreakdown(grossAmount);

  const { rows } = await pool.query<OwnerEarning>(
    `INSERT INTO owner_earnings (owner_id, deal_id, channel_id, gross_amount, platform_fee, net_amount)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [ownerId, dealId, channelId, split.gross_amount, split.fee_amount, split.net_amount],
  );
  return rows[0];
}

export interface EarningsSummary {
  total_earned: number;
  total_pending: number;
  total_paid: number;
  platform_fees: number;
  available_to_withdraw: number;
  next_payout_at: Date | null;
  next_payout_amount: number;
}

export interface WithdrawPreview {
  gross_amount: number;
  fee_percent: number;
  fee_amount: number;
  net_amount: number;
}

export async function getEarningsSummary(ownerId: number): Promise<EarningsSummary> {
  const { rows } = await pool.query<{
    total_earned: string;
    total_pending: string;
    total_paid: string;
    platform_fees: string;
    available_to_withdraw: string;
    next_payout_at: Date | null;
    next_payout_amount: string;
  }>(
    `SELECT
       COALESCE(SUM(net_amount), 0) AS total_earned,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN net_amount END), 0) AS total_pending,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN net_amount END), 0) AS total_paid,
       COALESCE(SUM(platform_fee), 0) AS platform_fees,
       COALESCE(SUM(CASE WHEN status = 'pending' AND payout_at <= NOW() AND withdraw_request_id IS NULL THEN net_amount END), 0) AS available_to_withdraw,
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
    available_to_withdraw: Number(r.available_to_withdraw),
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

export async function getWithdrawPreview(ownerId: number): Promise<WithdrawPreview> {
  const { rows } = await pool.query<{
    gross_amount: string;
    fee_amount: string;
    net_amount: string;
  }>(
    `SELECT
       COALESCE(SUM(gross_amount), 0) AS gross_amount,
       COALESCE(SUM(platform_fee), 0) AS fee_amount,
       COALESCE(SUM(net_amount), 0) AS net_amount
     FROM owner_earnings
     WHERE owner_id = $1
       AND status = 'pending'
       AND payout_at <= NOW()
       AND withdraw_request_id IS NULL`,
    [ownerId],
  );

  const gross = Number(rows[0].gross_amount);
  const feeAmount = Number(rows[0].fee_amount);
  const net = Number(rows[0].net_amount);
  const feePercent = gross > 0
    ? Number(((feeAmount / gross) * 100).toFixed(2))
    : getPlatformFeePercent(0);

  return {
    gross_amount: gross,
    fee_percent: feePercent,
    fee_amount: feeAmount,
    net_amount: net,
  };
}

export async function getLatestWithdrawRequest(ownerId: number): Promise<WithdrawRequest | null> {
  const { rows } = await pool.query<WithdrawRequest>(
    `SELECT *
     FROM withdraw_requests
     WHERE owner_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [ownerId],
  );
  return rows[0] ?? null;
}

export async function getActiveWithdrawRequest(ownerId: number): Promise<WithdrawRequest | null> {
  const { rows } = await pool.query<WithdrawRequest>(
    `SELECT *
     FROM withdraw_requests
     WHERE owner_id = $1
       AND status IN ('pending', 'awaiting_tx_link')
     ORDER BY created_at DESC
     LIMIT 1`,
    [ownerId],
  );
  return rows[0] ?? null;
}

export async function getWithdrawRequestById(id: number): Promise<WithdrawRequest | null> {
  const { rows } = await pool.query<WithdrawRequest>(
    'SELECT * FROM withdraw_requests WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function getLatestAwaitingWithdrawRequestByAdminChat(
  adminChatId: number,
): Promise<WithdrawRequest | null> {
  const { rows } = await pool.query<WithdrawRequest>(
    `SELECT *
     FROM withdraw_requests
     WHERE admin_chat_id = $1
       AND status = 'awaiting_tx_link'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [adminChatId],
  );
  return rows[0] ?? null;
}

export async function createWithdrawRequest(
  ownerId: number,
  walletAddress: string,
  adminChatId: number,
  minWithdrawTon: number,
): Promise<WithdrawRequest> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const active = await client.query<{ id: number }>(
      `SELECT id
       FROM withdraw_requests
       WHERE owner_id = $1
         AND status IN ('pending', 'awaiting_tx_link')
       LIMIT 1
       FOR UPDATE`,
      [ownerId],
    );
    if (active.rows.length > 0) {
      throw new Error('You already have an active withdraw request');
    }

    const eligible = await client.query<{ id: number; net_amount: number }>(
      `SELECT id, net_amount
       FROM owner_earnings
       WHERE owner_id = $1
         AND status = 'pending'
         AND payout_at <= NOW()
         AND withdraw_request_id IS NULL
       ORDER BY id
       FOR UPDATE`,
      [ownerId],
    );
    if (eligible.rows.length === 0) {
      throw new Error('No withdrawable balance yet');
    }

    const earningIds = eligible.rows.map((row) => row.id);
    const amount = eligible.rows.reduce((sum, row) => sum + Number(row.net_amount), 0);
    if (amount < minWithdrawTon) {
      throw new Error(`Minimum withdraw amount is ${minWithdrawTon} TON`);
    }

    const inserted = await client.query<WithdrawRequest>(
      `INSERT INTO withdraw_requests (owner_id, wallet_address, amount, admin_chat_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ownerId, walletAddress, amount, adminChatId],
    );
    const request = inserted.rows[0];

    await client.query(
      `UPDATE owner_earnings
       SET withdraw_request_id = $1
       WHERE id = ANY($2::int[])`,
      [request.id, earningIds],
    );

    await client.query('COMMIT');
    return request;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setWithdrawRequestAdminMessage(
  requestId: number,
  adminMessageId: number,
): Promise<void> {
  await pool.query(
    `UPDATE withdraw_requests
     SET admin_message_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [requestId, adminMessageId],
  );
}

export async function markWithdrawRequestAwaitingTxLink(requestId: number): Promise<WithdrawRequest | null> {
  const { rows } = await pool.query<WithdrawRequest>(
    `UPDATE withdraw_requests
     SET status = 'awaiting_tx_link', reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [requestId],
  );
  return rows[0] ?? null;
}

export async function cancelWithdrawRequest(requestId: number): Promise<WithdrawRequest | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = await client.query<WithdrawRequest>(
      `UPDATE withdraw_requests
       SET status = 'cancelled', reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'awaiting_tx_link')
       RETURNING *`,
      [requestId],
    );
    const request = updated.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE owner_earnings
       SET withdraw_request_id = NULL
       WHERE withdraw_request_id = $1
         AND status = 'pending'`,
      [requestId],
    );

    await client.query('COMMIT');
    return request;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function markWithdrawRequestPaid(
  requestId: number,
  txLink: string,
): Promise<WithdrawRequest | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = await client.query<WithdrawRequest>(
      `UPDATE withdraw_requests
       SET status = 'paid', tx_link = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'awaiting_tx_link'
       RETURNING *`,
      [requestId, txLink],
    );
    const request = updated.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE owner_earnings
       SET status = 'paid',
           paid_at = NOW()
       WHERE withdraw_request_id = $1
         AND status = 'pending'`,
      [requestId],
    );

    await client.query('COMMIT');
    return request;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
