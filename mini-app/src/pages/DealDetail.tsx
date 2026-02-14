import { useEffect, useState } from 'react';
import { getDeal, approveDeal, rejectDeal, requestPayment, cancelDeal, type Deal } from '../api';

const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
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
    try {
      const updated = await approveDeal(dealId);
      setDeal(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      const updated = await rejectDeal(dealId, rejectReason || undefined);
      setDeal(updated);
      setShowRejectForm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading deal...</div>;
  if (error && !deal) return <div className="error">{error}</div>;
  if (!deal) return <div className="error">Deal not found</div>;

  const isCpc = deal.pricing_model === 'cpc';
  const spent = Number(deal.budget_spent);
  const budgetRemaining = isCpc ? deal.budget - spent : 0;
  const budgetPercent = isCpc && deal.budget > 0
    ? Math.round((spent / deal.budget) * 100)
    : 0;
  const formatSpent = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(2);

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="detail-header">
        <div className="detail-title">Deal #{deal.id}</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={`card-badge status-${deal.status}`}>
            {STATUS_LABELS[deal.status] ?? deal.status}
          </span>
          <span className="card-badge" style={{
            background: isCpc ? 'rgba(39, 188, 255, 0.12)' : 'rgba(255, 107, 43, 0.12)',
            color: isCpc ? '#27bcff' : '#ff6b2b',
          }}>
            {isCpc ? 'CPC' : 'Time-based'}
          </span>
        </div>
        <div className="detail-price">{deal.price} Stars</div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="detail-section">
        <h3>Ad Preview</h3>
        {deal.ad_image_url && (
          <img
            src={deal.ad_image_url}
            alt="Ad image"
            style={{
              width: '100%',
              maxHeight: 250,
              objectFit: 'cover',
              borderRadius: 8,
              marginBottom: 8,
            }}
          />
        )}
        <div className="ad-preview">{deal.ad_text}</div>
        {deal.ad_link && (
          <div style={{
            marginTop: 8,
            padding: '10px 14px',
            background: 'var(--tg-secondary-bg)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
          }}>
            <span>🔗</span>
            <a
              href={deal.ad_link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--fox-amber)', textDecoration: 'none', wordBreak: 'break-all' }}
            >
              {deal.ad_link}
            </a>
          </div>
        )}
      </div>

      <div className="detail-section">
        <h3>Details</h3>

        <div className="detail-row">
          <span>Pricing</span>
          <strong>{isCpc ? 'Cost per Click' : 'Time-based'}</strong>
        </div>

        {isCpc ? (
          <>
            <div className="detail-row">
              <span>Budget</span>
              <strong>{deal.budget} Stars</strong>
            </div>
            <div className="detail-row">
              <span>Spent</span>
              <strong style={{ color: 'var(--fox-amber)' }}>{formatSpent(spent)} Stars</strong>
            </div>
            <div className="detail-row">
              <span>Remaining</span>
              <strong style={{ color: budgetRemaining > 0 ? 'var(--fox-green)' : 'var(--tg-hint)' }}>
                {formatSpent(budgetRemaining)} Stars
              </strong>
            </div>
            <div className="detail-row">
              <span>Clicks</span>
              <strong style={{ color: 'var(--fox-amber)' }}>{deal.click_count}</strong>
            </div>

            {/* Budget progress bar */}
            {deal.budget > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--tg-secondary-bg)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(budgetPercent, 100)}%`,
                    borderRadius: 4,
                    background: budgetPercent >= 100
                      ? 'var(--fox-green)'
                      : 'linear-gradient(90deg, #ff6b2b, #ffb347)',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--tg-hint)', marginTop: 4, textAlign: 'right' }}>
                  {budgetPercent}% used
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="detail-row">
              <span>Duration</span>
              <strong>{deal.duration_hours}h</strong>
            </div>
            {deal.ad_link && (
              <div className="detail-row">
                <span>Button Clicks</span>
                <strong style={{ color: 'var(--fox-amber)' }}>{deal.click_count}</strong>
              </div>
            )}
          </>
        )}

        <div className="detail-row">
          <span>Status</span>
          <strong>{STATUS_LABELS[deal.status] ?? deal.status}</strong>
        </div>
        {deal.posted_at && (
          <div className="detail-row">
            <span>Posted</span>
            <strong>{new Date(deal.posted_at).toLocaleString()}</strong>
          </div>
        )}
        {deal.verified_at && (
          <div className="detail-row">
            <span>Verified</span>
            <strong>{new Date(deal.verified_at).toLocaleString()}</strong>
          </div>
        )}
        {deal.rejection_reason && (
          <div className="detail-row">
            <span>Rejection reason</span>
            <strong>{deal.rejection_reason}</strong>
          </div>
        )}
      </div>

      <div className="separator" />

      {/* Owner actions: approve/reject when pending */}
      {isOwner && deal.status === 'pending_approval' && (
        <div>
          {showRejectForm ? (
            <div>
              <div className="form-group">
                <label className="form-label">Rejection Reason (optional)</label>
                <textarea
                  className="form-textarea"
                  placeholder="Why are you rejecting this ad?"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{ minHeight: 80 }}
                />
              </div>
              <button
                className="btn btn-danger"
                onClick={handleReject}
                disabled={actionLoading}
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowRejectForm(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div>
              <button
                className="btn btn-primary"
                onClick={handleApprove}
                disabled={actionLoading}
              >
                {actionLoading ? 'Approving...' : 'Approve Deal'}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setShowRejectForm(true)}
                disabled={actionLoading}
              >
                Reject Deal
              </button>
            </div>
          )}
        </div>
      )}

      {/* Advertiser: pay button when approved */}
      {!isOwner && deal.status === 'approved' && (
        <div>
          <button
            className="btn btn-primary"
            onClick={async () => {
              setActionLoading(true);
              setError('');
              try {
                const { invoiceLink } = await requestPayment(dealId);
                const tg = window.Telegram?.WebApp;
                if (tg?.openInvoice) {
                  tg.openInvoice(invoiceLink, (status) => {
                    if (status === 'paid') {
                      fetchDeal();
                    } else if (status === 'failed') {
                      setError('Payment failed. Please try again.');
                    }
                  });
                } else {
                  setError('Payment is only available inside Telegram.');
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setActionLoading(false);
              }
            }}
            disabled={actionLoading}
          >
            {actionLoading ? 'Loading...' : `Pay ${deal.price} Stars`}
          </button>
        </div>
      )}

      {/* Status messages */}
      {deal.status === 'posted' && (
        <div className="info-card info">
          <p><strong>Ad is live!</strong></p>
          <p style={{ fontSize: 13, color: 'var(--tg-hint)', marginTop: 4 }}>
            {isCpc
              ? `CPC ad is running. ${formatSpent(budgetRemaining)} Stars remaining (${deal.click_count} clicks so far). Post will be removed when budget runs out.`
              : 'The bot will verify the post is still active after the timer expires.'}
          </p>
        </div>
      )}

      {deal.status === 'completed' && (
        <div className="info-card success">
          <p><strong>Deal completed!</strong></p>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            {isCpc
              ? `${deal.click_count} clicks delivered. ${formatSpent(spent)} Stars spent.${budgetRemaining > 0 ? ` ${formatSpent(budgetRemaining)} Stars refunded.` : ''}`
              : `Payment of ${deal.price} Stars has been released.`}
          </p>
        </div>
      )}

      {deal.status === 'refunded' && (
        <div className="info-card danger">
          <p><strong>Refunded</strong></p>
          <p style={{ fontSize: 13, marginTop: 4 }}>{deal.price} Stars have been refunded to the advertiser.</p>
        </div>
      )}

      {deal.status === 'cancelled' && (
        <div className="info-card" style={{ background: 'rgba(139,139,158,0.1)', border: '1px solid rgba(139,139,158,0.2)' }}>
          <p><strong>Cancelled</strong></p>
          <p style={{ fontSize: 13, color: 'var(--tg-hint)', marginTop: 4 }}>This deal was cancelled by the advertiser.</p>
        </div>
      )}

      {/* Cancel button for advertiser (before payment) */}
      {!isOwner && ['created', 'pending_approval', 'approved'].includes(deal.status) && (
        <button
          className="btn btn-danger"
          style={{ marginTop: 12 }}
          onClick={async () => {
            if (!confirm('Cancel this deal?')) return;
            setActionLoading(true);
            try {
              const updated = await cancelDeal(dealId);
              setDeal(updated);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setActionLoading(false);
            }
          }}
          disabled={actionLoading}
        >
          {actionLoading ? 'Cancelling...' : 'Cancel Deal'}
        </button>
      )}
    </div>
  );
}
