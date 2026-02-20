const BASE = '/api';

function getInitData(): string {
  return window.Telegram?.WebApp?.initData ?? '';
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `tma ${getInitData()}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

export interface PublicConfig {
  tonNetwork: 'testnet' | 'mainnet';
  adminChannelId: number;
}

// Types matching backend
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
  approval_status: 'pending' | 'approved' | 'rejected';
  photo_url: string | null;
  rating_avg: number;
  rating_count: number;
  completed_deals_count: number;
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
  status: string;
  posted_message_id: string | null;
  posted_at: string | null;
  ad_views: number | null;
  ad_views_checked_at: string | null;
  verified_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  rejection_reason: string | null;
  button_text: string;
  campaign_id?: number | null;
  campaign_title?: string | null;
  created_at: string;
  updated_at: string;
}

// Channels
export const getChannels = () => request<Channel[]>('/channels');
export const getMyChannels = () => request<Channel[]>('/channels/mine');
export const getChannel = (id: number) => request<Channel>(`/channels/${id}`);
export const createChannel = (data: {
  telegramChannelId: string;
  category: string;
  price: number;
  durationHours: number;
  cpcPrice?: number;
}) => request<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) });
export const deleteChannel = (id: number) =>
  request<{ success: boolean }>(`/channels/${id}`, { method: 'DELETE' });
export const activateChannel = (id: number) =>
  request<{ success: boolean }>(`/channels/${id}/activate`, { method: 'POST' });
export const getConfig = () => request<PublicConfig>('/config');

// Deals
export const getMyDeals = () => request<Deal[]>('/deals');
export const getIncomingDeals = () => request<Deal[]>('/deals/incoming');
export const getDeal = (id: number) => request<Deal>(`/deals/${id}`);
export const createDeal = (data: {
  channelId: number;
  adText: string;
  adImageUrl?: string | null;
  adLink?: string | null;
  pricingModel?: 'time' | 'cpc';
  budget?: number;
  buttonText?: string;
}) => request<Deal>('/deals', { method: 'POST', body: JSON.stringify(data) });
export const approveDeal = (id: number) =>
  request<Deal>(`/deals/${id}/approve`, { method: 'POST' });
export const rejectDeal = (id: number, reason?: string) =>
  request<Deal>(`/deals/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
export interface TonPaymentInfo {
  walletAddress: string;
  amount: number;
  amountNano: string;
  comment: string;
  dealId: number;
  network: 'testnet' | 'mainnet';
}

export const requestPayment = (id: number) =>
  request<{ tonPayment: TonPaymentInfo }>(`/deals/${id}/pay`, { method: 'POST' });

export const confirmPayment = (id: number, bocHash?: string) =>
  request<{ success: boolean }>(`/deals/${id}/confirm-payment`, {
    method: 'POST',
    body: JSON.stringify({ bocHash }),
  });
export const cancelDeal = (id: number) =>
  request<Deal>(`/deals/${id}/cancel`, { method: 'POST' });

// Campaigns (multi-channel)
export interface Campaign {
  id: number;
  advertiser_user_id: number;
  title: string | null;
  ad_text: string;
  ad_image_url: string | null;
  ad_link: string | null;
  button_text: string | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface CampaignListItem extends Campaign {
  items_total: number;
  approved: number;
  paid: number;
  posted: number;
  rejected: number;
  expired: number;
}

export interface CampaignItem {
  id: number;
  campaign_id: number;
  channel_id: number;
  deal_id: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  channel_username: string;
  channel_category: string;
  channel_subscribers: number;
  deal_status: string | null;
  ad_views: number | null;
}

export const getCampaigns = () => request<CampaignListItem[]>('/campaigns');

export const getCampaign = (id: number) =>
  request<{ campaign: Campaign; items: CampaignItem[] }>(`/campaigns/${id}`);

export const createCampaign = (data: {
  title?: string | null;
  ad_text: string;
  ad_image_url?: string | null;
  ad_link?: string | null;
  button_text?: string;
  channel_ids: number[];
  schedule_at?: string;
}) =>
  request<{ campaign: Campaign; items: CampaignItem[] }>('/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const submitCampaign = (id: number) =>
  request<{ campaign: Campaign; items: CampaignItem[]; submitted: boolean }>(`/campaigns/${id}/submit`, {
    method: 'POST',
  });

export const cancelCampaign = (id: number) =>
  request<{ campaign: Campaign; items: CampaignItem[] }>(`/campaigns/${id}/cancel`, {
    method: 'POST',
  });

export const deleteCampaign = (id: number) =>
  request<{ success: boolean }>(`/campaigns/${id}/delete`, {
    method: 'POST',
  });

export const payAllApprovedCampaign = (id: number) =>
  request<{
    success: boolean;
    campaign: Campaign;
    items: CampaignItem[];
    summary: {
      approvedCount: number;
      paidNow: number;
      skippedCount: number;
      failedCount: number;
    };
    failed: Array<{ dealId: number; reason: string }>;
  }>(`/campaigns/${id}/pay-all-approved`, {
    method: 'POST',
  });

export const removeCampaignItem = (id: number) =>
  request<{ success: boolean }>(`/campaign_items/${id}/remove`, {
    method: 'POST',
  });

// Earnings
export interface EarningsSummary {
  total_earned: number;
  total_pending: number;
  total_paid: number;
  platform_fees: number;
  available_to_withdraw: number;
  next_payout_at: string | null;
  next_payout_amount: number;
}

export interface WithdrawRequest {
  id: number;
  amount: number;
  wallet_address: string;
  status: 'pending' | 'awaiting_tx_link' | 'paid' | 'cancelled';
  tx_link: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface WithdrawPreview {
  gross_amount: number;
  fee_percent: number;
  fee_amount: number;
  net_amount: number;
}

export interface EarningRecord {
  id: number;
  deal_id: number;
  channel_id: number;
  channel_username: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  status: 'pending' | 'paid';
  earned_at: string;
  payout_at: string;
  paid_at: string | null;
}

export const getEarnings = () =>
  request<{
    summary: EarningsSummary;
    history: EarningRecord[];
    withdrawRequest: WithdrawRequest | null;
    walletAddress: string | null;
    minWithdrawTon: number;
    withdrawPreview: WithdrawPreview;
  }>('/earnings');

export const getWallet = () =>
  request<{ walletAddress: string | null }>('/earnings/wallet');

export const saveWallet = (walletAddress: string) =>
  request<{ walletAddress: string }>('/earnings/wallet', {
    method: 'POST',
    body: JSON.stringify({ walletAddress }),
  });

export const createWithdrawRequest = () =>
  request<{ success: boolean; request: WithdrawRequest }>('/earnings/withdraw-request', {
    method: 'POST',
  });

// Upload
export async function uploadImage(file: File): Promise<string> {
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      Authorization: `tma ${getInitData()}`,
    },
    body: file,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Upload failed');
  }

  const data = await res.json();
  return data.url;
}
