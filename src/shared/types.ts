// Deal status union type — all deal state transitions go through src/escrow/
export type DealStatus =
  | 'created'
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
  role: UserRole;
  created_at: Date;
}

export interface Channel {
  id: number;
  owner_id: number;
  telegram_channel_id: string;
  username: string;
  subscribers: number;
  category: string;
  price: number;
  duration_hours: number;
  bot_is_admin: boolean;
  is_active: boolean;
}

export interface Deal {
  id: number;
  advertiser_id: number;
  channel_id: number;
  ad_text: string;
  ad_image_url: string | null;
  duration_hours: number;
  price: number;
  status: DealStatus;
  posted_message_id: string | null;
  posted_at: Date | null;
  verified_at: Date | null;
  paid_at: Date | null;
  completed_at: Date | null;
  rejection_reason: string | null;
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
