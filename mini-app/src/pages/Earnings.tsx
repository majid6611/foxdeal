import { useEffect, useState } from 'react';
import { getEarnings, type EarningsSummary, type EarningRecord } from '../api';
import { Group, GroupItem, Text, Spinner } from '@telegram-tools/ui-kit';

export function Earnings() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [history, setHistory] = useState<EarningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getEarnings()
      .then((data) => { setSummary(data.summary); setHistory(data.history); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;
  if (error) return <Text color="danger">{error}</Text>;
  if (!summary) return null;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const daysUntil = (d: string) => { const diff = new Date(d).getTime() - Date.now(); return Math.max(0, Math.ceil(diff / 86400000)); };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Earnings</div>
        <div className="page-subtitle">Revenue and payout schedule</div>
      </div>

      {/* Summary Grid */}
      <div className="earnings-grid">
        <div className="earnings-card">
          <Text type="caption2" color="secondary">Total Earned</Text>
          <div className="earnings-card-value price-tag">{summary.total_earned} TON</div>
        </div>
        <div className="earnings-card">
          <Text type="caption2" color="secondary">Pending</Text>
          <div className="earnings-card-value" style={{ color: 'var(--fox-amber)' }}>{summary.total_pending} TON</div>
        </div>
        <div className="earnings-card">
          <Text type="caption2" color="secondary">Paid Out</Text>
          <div className="earnings-card-value" style={{ color: 'var(--fox-success)' }}>{summary.total_paid} TON</div>
        </div>
        <div className="earnings-card">
          <Text type="caption2" color="secondary">Fees (5%)</Text>
          <div className="earnings-card-value" style={{ color: 'var(--tg-hint)' }}>{summary.platform_fees} TON</div>
        </div>
      </div>

      {/* Next payout */}
      {summary.next_payout_at && summary.next_payout_amount > 0 && (
        <div className="deal-banner info" style={{ marginBottom: 18 }}>
          <div className="deal-banner-icon">💰</div>
          <div className="deal-banner-text">
            <div className="deal-banner-title">{summary.next_payout_amount} TON coming</div>
            <div className="deal-banner-desc">
              in {daysUntil(summary.next_payout_at)} days · {fmtDate(summary.next_payout_at)}
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <Group header="How Payouts Work">
        <GroupItem text="Your share" after={<Text type="body" weight="bold" color="accent">95%</Text>} />
        <GroupItem text="Hold period" after={<Text type="body" weight="bold">30 days</Text>} />
        <GroupItem text="" description="You receive 95% of each ad payment. Earnings are held for 30 days after the deal completes, then transferred to your account." />
      </Group>

      {/* History */}
      <div className="section-divider" style={{ marginTop: 24 }}>
        <span className="section-divider-text">History</span>
      </div>

      {history.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">💰</div>
          <Text type="body" color="secondary">No earnings yet.</Text>
          <Text type="caption1" color="tertiary">Complete your first deal to start earning.</Text>
        </div>
      ) : (
        history.map((e) => (
          <div key={e.id} style={{ marginBottom: 10 }}>
            <Group header={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span>@{e.channel_username} · #{e.deal_id}</span>
                <span className="status-pill" style={{
                  background: e.status === 'paid' ? 'rgba(52,199,89,0.12)' : 'rgba(0,122,255,0.12)',
                  color: e.status === 'paid' ? '#34c759' : '#007aff',
                }}>
                  {e.status === 'paid' ? 'Paid' : 'Pending'}
                </span>
              </div>
            }>
              <GroupItem text="Payment" after={<Text type="body" weight="bold">{e.gross_amount} TON</Text>} />
              <GroupItem text="Fee (5%)" after={<Text type="body" color="secondary">-{e.platform_fee} TON</Text>} />
              <GroupItem text="You earned" after={<Text type="body" weight="bold" color="accent">{e.net_amount} TON</Text>} />
              <GroupItem
                text={e.status === 'paid' ? 'Paid on' : 'Payout in'}
                after={
                  <Text type="caption1" color="secondary">
                    {e.status === 'paid' && e.paid_at
                      ? fmtDate(e.paid_at)
                      : `${fmtDate(e.payout_at)} (${daysUntil(e.payout_at)}d)`}
                  </Text>
                }
              />
            </Group>
          </div>
        ))
      )}
    </div>
  );
}
