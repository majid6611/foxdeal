import { useEffect, useState } from 'react';
import { getMyDeals, getIncomingDeals, type Deal } from '../api';

const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
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

export function MyDeals({
  isOwner,
  onSelectDeal,
}: {
  isOwner: boolean;
  onSelectDeal: (dealId: number) => void;
}) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDeals = isOwner ? getIncomingDeals : getMyDeals;
    fetchDeals()
      .then(setDeals)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOwner]);

  if (loading) return <div className="loading">Loading deals...</div>;
  if (error) return <div className="error">{error}</div>;

  if (deals.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🦊</div>
        <p>{isOwner ? 'No incoming deals yet.' : 'No deals yet.'}</p>
        <p style={{ fontSize: 13, marginTop: 8 }}>
          {isOwner
            ? 'Deals will appear here when advertisers submit ads for your channels.'
            : 'Browse the catalog to place your first ad.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: 14 }}>
        {isOwner ? 'Incoming Deals' : 'My Deals'}
      </h2>
      {deals.map((deal) => (
        <div key={deal.id} className="card" onClick={() => onSelectDeal(deal.id)}>
          <div className="card-header">
            <div>
              <div className="card-title">Deal #{deal.id}</div>
              <div className="card-subtitle">
                {deal.ad_text.length > 60
                  ? deal.ad_text.slice(0, 60) + '...'
                  : deal.ad_text}
              </div>
            </div>
            <span className={`card-badge status-${deal.status}`}>
              {STATUS_LABELS[deal.status] ?? deal.status}
            </span>
          </div>
          <div className="card-row">
            <span className="price-tag">{deal.price} Stars</span>
            <span style={{ fontSize: 13, color: 'var(--tg-hint)' }}>
              {new Date(deal.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
