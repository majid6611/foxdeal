import { useEffect, useMemo, useState } from 'react';
import { getMyDeals, getIncomingDeals, type Deal } from '../api';
import { Text, Spinner } from '@telegram-tools/ui-kit';

const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  pending_admin: 'Review',
  pending_approval: 'Pending',
  approved: 'Pay Now',
  rejected: 'Rejected',
  escrow_held: 'Paid',
  posted: 'Live',
  verified: 'Verified',
  completed: 'Done',
  disputed: 'Disputed',
  refunded: 'Refunded',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

function statusColor(s: string): string {
  if (['completed', 'verified'].includes(s)) return '#34c759';
  if (['posted', 'escrow_held'].includes(s)) return '#007aff';
  if (['rejected', 'refunded', 'cancelled', 'disputed'].includes(s)) return '#ff3b30';
  if (['approved'].includes(s)) return '#ff9500';
  return '#8e8e93';
}

export function MyDeals({
  isOwner,
  onSelectDeal,
}: {
  isOwner: boolean;
  onSelectDeal: (dealId: number) => void;
}) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'views'>('date');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sortedDeals = useMemo(() => {
    const viewMetric = (deal: Deal): number => {
      if (typeof deal.ad_views === 'number') return deal.ad_views;
      return deal.click_count;
    };

    return [...deals].sort((a, b) => {
      if (sortBy === 'views') return viewMetric(b) - viewMetric(a);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [deals, sortBy]);

  useEffect(() => {
    const fetchDeals = isOwner ? getIncomingDeals : getMyDeals;
    fetchDeals()
      .then(setDeals)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOwner]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;
  if (error) return <Text color="danger">{error}</Text>;

  if (deals.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🦊</div>
        <Text type="body" color="secondary">{isOwner ? 'No incoming deals yet.' : 'No deals yet.'}</Text>
        <Text type="caption1" color="tertiary">
          {isOwner
            ? 'Deals will appear here when advertisers submit ads for your channels.'
            : 'Browse the catalog to place your first ad.'}
        </Text>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">{isOwner ? 'Incoming Deals' : 'My Deals'}</div>
        <div className="page-subtitle">{deals.length} deal{deals.length !== 1 ? 's' : ''}</div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <select
          className="form-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'date' | 'views')}
          aria-label="Sort deals"
        >
          <option value="date">Sort by date (newest)</option>
          <option value="views">Sort by views (highest)</option>
        </select>
      </div>

      {sortedDeals.map((deal) => (
        <div key={deal.id} className="ch-card" onClick={() => onSelectDeal(deal.id)}>
          <div className="ch-avatar" style={{
            background: `${statusColor(deal.status)}22`,
            color: statusColor(deal.status),
            fontSize: 14,
            fontWeight: 800,
          }}>
            #{deal.id}
          </div>
          <div className="ch-card-body">
            <div className="ch-card-top">
              <span className="ch-card-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Deal #{deal.id}
                {deal.pricing_model === 'cpc' && (
                  <span className="badge badge-cpc">CPC</span>
                )}
              </span>
              <span className="status-pill" style={{
                background: `${statusColor(deal.status)}18`,
                color: statusColor(deal.status),
              }}>
                {STATUS_LABELS[deal.status] ?? deal.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--tg-hint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deal.ad_text.length > 50 ? deal.ad_text.slice(0, 50) + '...' : deal.ad_text}
            </div>
            {deal.campaign_id && (
              <div style={{ fontSize: 11, color: 'var(--fox-blue)', marginTop: 4 }}>
                Campaign: {deal.campaign_title?.trim() || `Campaign #${deal.campaign_id}`}
              </div>
            )}
            <div className="ch-card-meta" style={{ marginTop: 4 }}>
              <span className="ch-card-price">
                {deal.pricing_model === 'cpc'
                  ? `${Number(deal.budget_spent) % 1 === 0 ? deal.budget_spent : Number(deal.budget_spent).toFixed(2)} / ${deal.budget} TON`
                  : `${deal.price} TON`}
              </span>
              {deal.pricing_model === 'cpc' && deal.click_count > 0 && (
                <span style={{ fontSize: 11, color: 'var(--tg-hint)' }}>{deal.click_count} clicks</span>
              )}
              {deal.pricing_model === 'time' && deal.ad_views !== null && (
                <span style={{ fontSize: 11, color: 'var(--tg-hint)' }}>{deal.ad_views.toLocaleString()} views</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--tg-hint)' }}>
                {new Date(deal.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <span className="ch-card-chevron">›</span>
        </div>
      ))}
    </div>
  );
}
