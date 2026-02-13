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

// Types matching backend
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
  status: string;
  posted_message_id: string | null;
  posted_at: string | null;
  verified_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  rejection_reason: string | null;
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
}) => request<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) });
export const deleteChannel = (id: number) =>
  request<{ success: boolean }>(`/channels/${id}`, { method: 'DELETE' });

// Deals
export const getMyDeals = () => request<Deal[]>('/deals');
export const getIncomingDeals = () => request<Deal[]>('/deals/incoming');
export const getDeal = (id: number) => request<Deal>(`/deals/${id}`);
export const createDeal = (data: {
  channelId: number;
  adText: string;
  adImageUrl?: string | null;
}) => request<Deal>('/deals', { method: 'POST', body: JSON.stringify(data) });
export const approveDeal = (id: number) =>
  request<Deal>(`/deals/${id}/approve`, { method: 'POST' });
export const rejectDeal = (id: number, reason?: string) =>
  request<Deal>(`/deals/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
export const requestPayment = (id: number) =>
  request<{ invoiceLink: string }>(`/deals/${id}/pay`, { method: 'POST' });
export const cancelDeal = (id: number) =>
  request<Deal>(`/deals/${id}/cancel`, { method: 'POST' });

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
