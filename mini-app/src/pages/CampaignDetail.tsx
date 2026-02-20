import { useEffect, useMemo, useState } from 'react';
import { Button, Spinner, Text } from '@telegram-tools/ui-kit';
import {
  cancelCampaign,
  deleteCampaign,
  getCampaign,
  payAllApprovedCampaign,
  removeCampaignItem,
  type Campaign,
  type CampaignItem,
} from '../api';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  waiting_approval: 'Waiting Approval',
  approved: 'Approved',
  paid: 'Paid',
  posted: 'Posted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

function statusClass(status: string): string {
  if (status === 'posted') return 'status-posted';
  if (status === 'paid') return 'status-escrow_held';
  if (status === 'approved') return 'status-approved';
  if (status === 'rejected') return 'status-rejected';
  if (status === 'cancelled') return 'status-cancelled';
  if (status === 'expired') return 'status-expired';
  if (status === 'waiting_approval' || status === 'draft') return 'status-pending_approval';
  return 'status-created';
}

export function CampaignDetail({
  campaignId,
  onBack,
  onOpenDeal,
  onDeleted,
}: {
  campaignId: number;
  onBack: () => void;
  onOpenDeal: (dealId: number) => void;
  onDeleted: () => void;
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await getCampaign(campaignId);
      setCampaign(data.campaign);
      setItems(data.items);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const stats = useMemo(() => {
    let approved = 0;
    let paid = 0;
    let posted = 0;
    let rejected = 0;
    let expired = 0;
    let pending = 0;
    for (const item of items) {
      if (item.status === 'approved') approved += 1;
      if (item.status === 'paid') paid += 1;
      if (item.status === 'posted') posted += 1;
      if (item.status === 'rejected') rejected += 1;
      if (item.status === 'expired') expired += 1;
      if (item.status === 'waiting_approval' || item.status === 'draft') pending += 1;
    }
    return { total: items.length, approved, paid, posted, rejected, expired, pending };
  }, [items]);

  const hasPaidOrOngoing = stats.paid > 0 || stats.posted > 0;
  const totalAdViews = items.reduce((sum, item) => sum + Number(item.ad_views ?? 0), 0);
  const approvedItems = items.filter((item) => item.status === 'approved');
  const nonApprovedItems = items.filter((item) => item.status !== 'approved');

  const renderItemCard = (item: CampaignItem) => (
    <div key={item.id} className="ch-card">
      <div className="ch-card-body">
        <div className="ch-card-top">
          <span className="ch-card-name">@{item.channel_username}</span>
          <span className={`status-pill ${statusClass(item.status)}`}>
            {STATUS_LABELS[item.status] ?? item.status}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--tg-hint)', marginTop: 2 }}>
          {item.channel_category} · {item.channel_subscribers.toLocaleString()} subs
        </div>
        {item.ad_views !== null && (
          <div style={{ fontSize: 12, color: 'var(--fox-amber)', marginTop: 4, fontWeight: 600 }}>
            Views: {Number(item.ad_views).toLocaleString()}
          </div>
        )}
        <div className="ch-card-meta" style={{ marginTop: 8 }}>
          {item.deal_id ? (
            <button
              type="button"
              className="campaign-link-btn"
              onClick={() => onOpenDeal(item.deal_id!)}
            >
              Open Deal #{item.deal_id}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--tg-hint)' }}>No linked deal</span>
          )}

          <button
            type="button"
            className="campaign-remove-btn"
            onClick={async () => {
              if (!confirm('Remove this campaign item?')) return;
              setError('');
              try {
                await removeCampaignItem(item.id);
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;
  if (error && !campaign) return <Text color="danger">{error}</Text>;
  if (!campaign) return <Text color="danger">Campaign not found</Text>;

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="page-header">
        <div className="page-title">{campaign.title?.trim() || `Campaign #${campaign.id}`}</div>
        <div className="page-subtitle">
          {stats.total} items · Approved {stats.approved} · Paid {stats.paid} · Posted {stats.posted}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {hasPaidOrOngoing ? (
        <div className="campaign-summary-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="earnings-card">
            <div className="page-subtitle">Ad Views</div>
            <div className="earnings-card-value">{totalAdViews.toLocaleString()}</div>
          </div>
        </div>
      ) : (
        <div className="campaign-summary-grid">
          <div className="earnings-card"><div className="page-subtitle">Approved</div><div className="earnings-card-value">{stats.approved}</div></div>
          <div className="earnings-card"><div className="page-subtitle">Pending</div><div className="earnings-card-value">{stats.pending}</div></div>
          <div className="earnings-card"><div className="page-subtitle">Paid</div><div className="earnings-card-value">{stats.paid}</div></div>
          <div className="earnings-card"><div className="page-subtitle">Posted</div><div className="earnings-card-value">{stats.posted}</div></div>
          <div className="earnings-card"><div className="page-subtitle">Rejected</div><div className="earnings-card-value">{stats.rejected}</div></div>
          <div className="earnings-card"><div className="page-subtitle">Expired</div><div className="earnings-card-value">{stats.expired}</div></div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {!hasPaidOrOngoing && (
          <>
            <Button
              text={actionLoading ? 'Refreshing...' : 'Refresh Status'}
              type="primary"
              disabled={actionLoading}
              onClick={async () => {
                setActionLoading(true);
                setError('');
                try {
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setActionLoading(false);
                }
              }}
            />
            <Button
              text={actionLoading ? 'Paying...' : `Pay All Approved (${stats.approved})`}
              type="secondary"
              disabled={actionLoading || stats.approved === 0}
              onClick={async () => {
                if (!confirm(`Pay all approved items now? (${stats.approved})`)) return;
                setActionLoading(true);
                setError('');
                try {
                  const result = await payAllApprovedCampaign(campaign.id);
                  if (result.summary.failedCount > 0) {
                    setError(`Paid ${result.summary.paidNow}/${result.summary.approvedCount}. Some items failed; try again.`);
                  }
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setActionLoading(false);
                }
              }}
            />
          </>
        )}
        {stats.pending > 0 && (
          <Button
            text={actionLoading ? 'Cancelling...' : 'Cancel Pending Items'}
            type="secondary"
            className="btn-danger-override"
            disabled={actionLoading}
            onClick={async () => {
              if (!confirm('Cancel all pending campaign items?')) return;
              setActionLoading(true);
              setError('');
              try {
                await cancelCampaign(campaign.id);
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setActionLoading(false);
              }
            }}
          />
        )}
        {!hasPaidOrOngoing && (
          <Button
            text={actionLoading ? 'Deleting...' : 'Delete Campaign'}
            type="secondary"
            className="btn-danger-override"
            disabled={actionLoading}
            onClick={async () => {
              if (!confirm('Delete this campaign? This works only if items are not paid or ongoing.')) return;
              setActionLoading(true);
              setError('');
              try {
                await deleteCampaign(campaign.id);
                onDeleted();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setActionLoading(false);
              }
            }}
          />
        )}
      </div>

      {approvedItems.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Text type="caption1" color="secondary" className="form-label-tg">Approved Items</Text>
          {approvedItems.map(renderItemCard)}
        </div>
      )}

      {nonApprovedItems.length > 0 && (
        <div>
          <Text type="caption1" color="secondary" className="form-label-tg">Other Items</Text>
          {nonApprovedItems.map(renderItemCard)}
        </div>
      )}
    </div>
  );
}
