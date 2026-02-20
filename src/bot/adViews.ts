import { getTimeDealsForViewSync, updateDealViewSnapshot } from '../db/queries.js';

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function startAdViewsSyncJob(): void {
  syncAdViews().catch((err) =>
    console.error('[adViews] Initial sync error:', err),
  );

  setInterval(() => {
    syncAdViews().catch((err) =>
      console.error('[adViews] Sync error:', err),
    );
  }, SYNC_INTERVAL_MS);

  console.log('[adViews] Ad views sync job started (every 10 minutes)');
}

async function syncAdViews(): Promise<void> {
  const deals = await getTimeDealsForViewSync();
  if (deals.length === 0) return;

  for (const deal of deals) {
    const messageId = Number(deal.posted_message_id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      continue;
    }

    const views = await fetchPostViews(deal.channel_username, messageId);
    await updateDealViewSnapshot(deal.id, views);
  }

  console.log(`[adViews] Synced views for ${deals.length} time-based deal(s)`);
}

async function fetchPostViews(username: string, messageId: number): Promise<number | null> {
  const cleanUsername = username.replace(/^@/, '').trim();
  if (!cleanUsername) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(`https://t.me/s/${cleanUsername}/${messageId}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    if (!resp.ok) return null;

    const html = await resp.text();
    const match = html.match(/tgme_widget_message_views[^>]*>([^<]+)</);
    if (!match?.[1]) return null;

    return parseViewsText(match[1]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseViewsText(raw: string): number | null {
  const text = raw.replace(/[,\s]/g, '').toUpperCase();
  if (!text) return null;

  const match = text.match(/^(\d+(?:\.\d+)?)([KM]?)$/);
  if (!match) return null;

  const value = Number(match[1]);
  const suffix = match[2];

  if (!Number.isFinite(value)) return null;
  if (suffix === 'K') return Math.round(value * 1_000);
  if (suffix === 'M') return Math.round(value * 1_000_000);
  return Math.round(value);
}
