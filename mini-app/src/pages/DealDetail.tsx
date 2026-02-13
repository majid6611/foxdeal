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
    // Poll for status changes every 5s
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

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="detail-header">
        <div className="detail-title">Deal #{deal.id}</div>
        <div style={{ marginTop: 8 }}>
          <span className={`card-badge status-${deal.status}`}>
            {STATUS_LABELS[deal.status] ?? deal.status}
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
      </div>

      <div className="detail-section">
        <h3>Details</h3>
        <div className="detail-row">
          <span>Duration</span>
          <strong>{deal.duration_hours}h</strong>
        </div>
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
                      // Refresh deal to see updated status
                      fetchDeal();
                    } else if (status === 'failed') {
                      setError('Payment failed. Please try again.');
                    }
                    // 'cancelled' = user closed the payment dialog
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
          <p><strong>Ad is live! 🦊</strong></p>
          <p style={{ fontSize: 13, color: 'var(--tg-hint)', marginTop: 4 }}>
            The bot will verify the post is still active after the timer expires.
          </p>
        </div>
      )}

      {deal.status === 'completed' && (
        <div className="info-card success">
          <p><strong>Deal completed!</strong></p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Payment of {deal.price} Stars has been released.</p>
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
