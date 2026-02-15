import { useEffect, useState } from 'react';
import { getDeal, approveDeal, rejectDeal, requestPayment, confirmPayment, cancelDeal, type Deal } from '../api';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { beginCell } from '@ton/core';
import { Button, Group, GroupItem, Text, Spinner } from '@telegram-tools/ui-kit';

function encodeComment(text: string): string {
  const cell = beginCell().storeUint(0, 32).storeStringTail(text).endCell();
  return cell.toBoc().toString('base64');
}

const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  pending_admin: 'Under Review',
  pending_approval: 'Pending Approval',
  approved: 'Approved — Pay Now',
  rejected: 'Rejected',
  escrow_held: 'Payment Held',
  posted: 'Ad Posted',
  verified: 'Verified',
  completed: 'Completed',
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

function statusIcon(s: string): string {
  if (['completed', 'verified'].includes(s)) return '✅';
  if (['posted'].includes(s)) return '📡';
  if (['escrow_held'].includes(s)) return '🔒';
  if (['approved'].includes(s)) return '💳';
  if (['pending_approval', 'pending_admin'].includes(s)) return '⏳';
  if (['rejected'].includes(s)) return '❌';
  if (['refunded'].includes(s)) return '↩️';
  if (['cancelled'].includes(s)) return '🚫';
  return '📋';
}

export function DealDetail({
  dealId,
  isOwner,
  onBack,
}: {
  dealId: number;
  isOwner: boolean;
  onBack: () => void;
}) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  const fetchDeal = () => {
    getDeal(dealId)
      .then(setDeal)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDeal();
    const interval = setInterval(fetchDeal, 5000);
    return () => clearInterval(interval);
  }, [dealId]);

  const handleApprove = async () => {
    setActionLoading(true);
    try { const updated = await approveDeal(dealId); setDeal(updated); }
    catch (e) { setError((e as Error).message); }
    finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try { const updated = await rejectDeal(dealId, rejectReason || undefined); setDeal(updated); setShowRejectForm(false); }
    catch (e) { setError((e as Error).message); }
    finally { setActionLoading(false); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;
  if (error && !deal) return <Text color="danger">{error}</Text>;
  if (!deal) return <Text color="danger">Deal not found</Text>;

  const isCpc = deal.pricing_model === 'cpc';
  const spent = Number(deal.budget_spent);
  const budgetRemaining = isCpc ? deal.budget - spent : 0;
  const budgetPercent = isCpc && deal.budget > 0 ? Math.round((spent / deal.budget) * 100) : 0;
  const fmt = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(2);

  const bannerClass =
    ['posted', 'escrow_held'].includes(deal.status) ? 'blue' :
    ['completed', 'verified'].includes(deal.status) ? 'success' :
    ['rejected', 'refunded'].includes(deal.status) ? 'danger' :
    ['cancelled', 'expired', 'disputed'].includes(deal.status) ? 'neutral' : 'info';

  const bannerDesc: Record<string, string> = {
    posted: isCpc
      ? `${fmt(budgetRemaining)} TON remaining · ${deal.click_count} clicks`
      : 'Bot will verify when the timer expires',
    completed: isCpc
      ? `${deal.click_count} clicks delivered · ${fmt(spent)} TON spent`
      : `Payment of ${deal.price} TON released`,
    refunded: `${deal.price} TON refunded to advertiser`,
    pending_admin: 'Under review by the Fox Deal team',
    pending_approval: 'Waiting for channel owner approval',
    approved: 'Ready for payment',
    cancelled: 'This deal was cancelled',
    escrow_held: 'Payment received, ad will be posted shortly',
  };

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back</button>

      {/* Status Banner */}
      <div className={`deal-banner ${bannerClass}`}>
        <div className="deal-banner-icon">{statusIcon(deal.status)}</div>
        <div className="deal-banner-text">
          <div className="deal-banner-title">{STATUS_LABELS[deal.status] ?? deal.status}</div>
          {bannerDesc[deal.status] && (
            <div className="deal-banner-desc">{bannerDesc[deal.status]}</div>
          )}
        </div>
      </div>

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text type="title2" weight="bold">Deal #{deal.id}</Text>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className={`badge ${isCpc ? 'badge-cpc' : 'badge-time'}`}>{isCpc ? 'CPC' : 'TIME'}</span>
          <span className="badge badge-price">{deal.price} TON</span>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Ad Preview */}
      {deal.ad_image_url && (
        <img src={deal.ad_image_url} alt="Ad" style={{ width: '100%', maxHeight: 250, objectFit: 'cover', borderRadius: 12, marginBottom: 12 }} />
      )}

      <div className="ad-preview-card">
        <div className="ad-preview-text">{deal.ad_text}</div>
        {deal.ad_link && (
          <>
            <div className="ad-preview-link" onClick={() => window.open(deal.ad_link!, '_blank')}>
              <span>🔗</span>
              <a href={deal.ad_link} target="_blank" rel="noopener noreferrer">{deal.ad_link}</a>
              <span style={{ color: 'var(--tg-hint)', fontSize: 16 }}>›</span>
            </div>
            <div className="ad-preview-btn-row">
              <div className="btn-preview-button">{deal.button_text || '🔗 Learn More'}</div>
            </div>
          </>
        )}
      </div>

      {/* Stats */}
      <Group header="Details">
        <GroupItem text="Pricing" after={<Text type="body" weight="medium">{isCpc ? 'Cost per Click' : 'Time-based'}</Text>} />
        {isCpc ? (
          <>
            <GroupItem text="Budget" after={<Text type="body" weight="bold" color="accent">{deal.budget} TON</Text>} />
            <GroupItem text="Spent" after={<Text type="body" weight="bold" color="accent">{fmt(spent)} TON</Text>} />
            <GroupItem text="Remaining" after={<Text type="body" weight="bold" color={budgetRemaining > 0 ? 'accent' : 'secondary'}>{fmt(budgetRemaining)} TON</Text>} />
            <GroupItem text="Unique Clicks" after={<Text type="body" weight="bold" color="accent">{deal.click_count}</Text>} />
          </>
        ) : (
          <>
            <GroupItem text="Duration" after={<Text type="body" weight="medium">{deal.duration_hours}h</Text>} />
            {deal.ad_link && (
              <GroupItem text="Link Clicks" after={<Text type="body" weight="bold" color="accent">{deal.click_count}</Text>} />
            )}
          </>
        )}
        {deal.posted_at && (
          <GroupItem text="Posted" after={<Text type="caption1" color="secondary">{new Date(deal.posted_at).toLocaleString()}</Text>} />
        )}
        {deal.verified_at && (
          <GroupItem text="Verified" after={<Text type="caption1" color="secondary">{new Date(deal.verified_at).toLocaleString()}</Text>} />
        )}
        {deal.rejection_reason && (
          <GroupItem text="Reason" description={deal.rejection_reason} />
        )}
      </Group>

      {/* CPC progress */}
      {isCpc && deal.budget > 0 && (
        <div className="progress-bar-wrap">
          <div className="progress-bar-track">
            <div className={`progress-bar-fill ${budgetPercent >= 100 ? 'full' : ''}`} style={{ width: `${Math.min(budgetPercent, 100)}%` }} />
          </div>
          <div className="progress-bar-label">{budgetPercent}% budget used</div>
        </div>
      )}

      {/* Owner actions */}
      {isOwner && deal.status === 'pending_approval' && (
        <div className="deal-actions">
          {showRejectForm ? (
            <>
              <textarea
                className="form-textarea"
                placeholder="Why are you rejecting this ad?"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{ minHeight: 80 }}
              />
              <button className="action-btn action-btn-danger" onClick={handleReject} disabled={actionLoading}>
                {actionLoading ? 'Rejecting...' : '❌ Confirm Reject'}
              </button>
              <button className="action-btn action-btn-ghost" onClick={() => setShowRejectForm(false)}>
                Cancel
              </button>
            </>
          ) : (
            <div className="deal-actions-row">
              <button className="action-btn action-btn-approve" onClick={handleApprove} disabled={actionLoading}>
                {actionLoading ? 'Approving...' : '✅ Approve'}
              </button>
              <button className="action-btn action-btn-reject" onClick={() => setShowRejectForm(true)} disabled={actionLoading}>
                ❌ Reject
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pay button */}
      {!isOwner && deal.status === 'approved' && (
        <div style={{ marginTop: 16 }}>
          <Button
            text={actionLoading ? 'Processing...' : `Pay ${deal.price} TON`}
            type="primary"
            onClick={async () => {
              setActionLoading(true); setError('');
              try { await confirmPayment(dealId); fetchDeal(); }
              catch (e) { setError((e as Error).message || 'Payment failed'); }
              finally { setActionLoading(false); }
            }}
            disabled={actionLoading}
            loading={actionLoading}
          />
        </div>
      )}

      {/* Cancel button */}
      {!isOwner && ['created', 'pending_admin', 'pending_approval', 'approved'].includes(deal.status) && (
        <div style={{ marginTop: 10 }}>
          <Button
            text={actionLoading ? 'Cancelling...' : 'Cancel Deal'}
            type="secondary"
            className="btn-danger-override"
            onClick={async () => {
              if (!confirm('Cancel this deal?')) return;
              setActionLoading(true);
              try { const updated = await cancelDeal(dealId); setDeal(updated); }
              catch (e) { setError((e as Error).message); }
              finally { setActionLoading(false); }
            }}
            disabled={actionLoading}
          />
        </div>
      )}
    </div>
  );
}
