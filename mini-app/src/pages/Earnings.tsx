import { useEffect, useState } from 'react';
import { getEarnings, type EarningsSummary, type EarningRecord } from '../api';

export function Earnings() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [history, setHistory] = useState<EarningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getEarnings()
      .then((data) => {
        setSummary(data.summary);
        setHistory(data.history);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading earnings...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!summary) return null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const daysUntilPayout = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  return (
    <div>
      <h2 className="section-title">Earnings</h2>
      <p className="section-subtitle">Your ad revenue and payout schedule</p>

      {/* Summary cards */}
      <div className="earnings-grid">
        <div className="earnings-card">
          <div className="earnings-card-label">Total Earned</div>
          <div className="earnings-card-value price-tag">{summary.total_earned} Stars</div>
        </div>
        <div className="earnings-card">
          <div className="earnings-card-label">Pending Payout</div>
          <div className="earnings-card-value" style={{ color: 'var(--fox-amber)' }}>
            {summary.total_pending} Stars
          </div>
        </div>
        <div className="earnings-card">
          <div className="earnings-card-label">Already Paid</div>
          <div className="earnings-card-value" style={{ color: 'var(--fox-success)' }}>
            {summary.total_paid} Stars
          </div>
        </div>
        <div className="earnings-card">
          <div className="earnings-card-label">Platform Fees (5%)</div>
          <div className="earnings-card-value" style={{ color: 'var(--tg-hint)' }}>
            {summary.platform_fees} Stars
          </div>
        </div>
      </div>

      {/* Next payout info */}
      {summary.next_payout_at && summary.next_payout_amount > 0 && (
        <div className="info-card info" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Next Payout</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            <span className="price-tag">{summary.next_payout_amount} Stars</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--tg-hint)', marginTop: 6 }}>
            in {daysUntilPayout(summary.next_payout_at)} days ({formatDate(summary.next_payout_at)})
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="card" style={{ cursor: 'default', marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>How Payouts Work</div>
        <div style={{ fontSize: 13, color: 'var(--tg-hint)', lineHeight: 1.7 }}>
          You receive <strong style={{ color: 'var(--fox-amber)' }}>95%</strong> of each ad payment.
          Earnings are held for <strong style={{ color: 'var(--tg-text)' }}>30 days</strong> after
          the deal completes, then transferred to your account.
        </div>
      </div>

      {/* History */}
      <h3 className="detail-section" style={{ marginBottom: 12 }}>
        <h3>Earnings History</h3>
      </h3>

      {history.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">💰</div>
          <p>No earnings yet.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Complete your first ad deal to start earning.
          </p>
        </div>
      ) : (
        history.map((e) => (
          <div key={e.id} className="card" style={{ cursor: 'default' }}>
            <div className="card-header">
              <div>
                <div className="card-title">@{e.channel_username}</div>
                <div className="card-subtitle">Deal #{e.deal_id}</div>
              </div>
              <span className={`card-badge ${e.status === 'paid' ? 'status-completed' : 'status-posted'}`}>
                {e.status === 'paid' ? 'Paid' : 'Pending'}
              </span>
            </div>

            <div className="detail-section" style={{ marginTop: 8 }}>
              <div className="detail-row">
                <span>Ad Payment</span>
                <strong>{e.gross_amount} Stars</strong>
              </div>
              <div className="detail-row">
                <span>Platform Fee (5%)</span>
                <strong style={{ color: 'var(--tg-hint)' }}>-{e.platform_fee} Stars</strong>
              </div>
              <div className="detail-row">
                <span>Your Earnings</span>
                <strong className="price-tag">{e.net_amount} Stars</strong>
              </div>
              <div className="detail-row">
                <span>Earned</span>
                <strong>{formatDate(e.earned_at)}</strong>
              </div>
              <div className="detail-row">
                <span>{e.status === 'paid' ? 'Paid On' : 'Payout Date'}</span>
                <strong>
                  {e.status === 'paid' && e.paid_at
                    ? formatDate(e.paid_at)
                    : `${formatDate(e.payout_at)} (${daysUntilPayout(e.payout_at)}d)`}
                </strong>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
