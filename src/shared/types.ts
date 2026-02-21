// Deal status union type — all deal state transitions go through src/escrow/
export type DealStatus =
  | 'created'
  | 'pending_admin'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'escrow_held'
  | 'posted'
  | 'verified'
  | 'completed'
  | 'disputed'
  | 'refunded'
  | 'expired'
  | 'cancelled';

export type TransactionType = 'hold' | 'release' | 'refund';
export type TransactionStatus = 'pending' | 'completed' | 'failed';
export type UserRole = 'advertiser' | 'owner';

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  role: UserRole;
  wallet_address: string | null;
  advertiser_rating_avg: number;
  advertiser_rating_count: number;
  created_at: Date;
}

export type ChannelApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Channel {
  id: number;
  owner_id: number;
  telegram_channel_id: string;
  username: string;
  subscribers: number;
  avg_post_views: number | null;
  most_used_language: string | null;
  category: string;
  price: number;
  duration_hours: number;
  cpc_price: number;
  bot_is_admin: boolean;
  is_active: boolean;
  approval_status: ChannelApprovalStatus;
  photo_url: string | null;
  rating_avg: number;
  rating_count: number;
  completed_deals_count: number;
  is_favorite?: boolean;
}

export interface Deal {
  id: number;
  advertiser_id: number;
  channel_id: number;
  ad_text: string;
  ad_image_url: string | null;
  ad_link: string | null;
  click_count: number;
  pricing_model: 'time' | 'cpc';
  budget: number;
  budget_spent: number;
  duration_hours: number;
  price: number;
  status: DealStatus;
  posted_message_id: string | null;
  posted_at: Date | null;
  ad_views: number | null;
  ad_views_checked_at: Date | null;
  verified_at: Date | null;
  paid_at: Date | null;
  completed_at: Date | null;
  rejection_reason: string | null;
  button_text: string;
  created_at: Date;
  updated_at: Date;
}

export interface Transaction {
  id: number;
  deal_id: number;
  type: TransactionType;
  amount: number;
  payment_method: string;
  status: TransactionStatus;
  created_at: Date;
}

export type EarningStatus = 'pending' | 'paid';
export type WithdrawRequestStatus = 'pending' | 'awaiting_tx_link' | 'paid' | 'cancelled';

export type CampaignStatus = 'active' | 'completed' | 'cancelled';

export interface Campaign {
  id: number;
  advertiser_user_id: number;
  title: string | null;
  ad_text: string;
  ad_image_url: string | null;
  ad_link: string | null;
  button_text: string | null;
  status: CampaignStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CampaignItem {
  id: number;
  campaign_id: number;
  channel_id: number;
  deal_id: number | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface OwnerEarning {
  id: number;
  owner_id: number;
  deal_id: number;
  channel_id: number;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  status: EarningStatus;
  withdraw_request_id: number | null;
  earned_at: Date;
  payout_at: Date;
  paid_at: Date | null;
}

export interface WithdrawRequest {
  id: number;
  owner_id: number;
  wallet_address: string;
  amount: number;
  status: WithdrawRequestStatus;
  tx_link: string | null;
  admin_chat_id: number;
  admin_message_id: number | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChannelRating {
  id: number;
  deal_id: number;
  channel_id: number;
  advertiser_id: number;
  score: number;
  created_at: Date;
}

export interface AdvertiserRating {
  id: number;
  deal_id: number;
  advertiser_id: number;
  owner_id: number;
  score: number;
  created_at: Date;
}
