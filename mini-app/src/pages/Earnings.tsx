import { useEffect, useState } from 'react';
import {
  createWithdrawRequest,
  getEarnings,
  saveWallet,
  type EarningsSummary,
  type EarningRecord,
  type WithdrawPreview,
  type WithdrawRequest,
} from '../api';
import { Group, GroupItem, Text, Spinner } from '@telegram-tools/ui-kit';

export function Earnings({ connectedWallet }: { connectedWallet: string | null }) {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [history, setHistory] = useState<EarningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [walletAddress, setWalletAddress] = useState('');
  const [walletSaved, setWalletSaved] = useState(false);
  const [walletEditing, setWalletEditing] = useState(false);
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [withdrawRequest, setWithdrawRequest] = useState<WithdrawRequest | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [minWithdrawTon, setMinWithdrawTon] = useState(5);
  const [withdrawPreview, setWithdrawPreview] = useState<WithdrawPreview>({
    gross_amount: 0,
    fee_percent: 0,
    fee_amount: 0,
    net_amount: 0,
  });

  useEffect(() => {
    getEarnings()
      .then((data) => {
        setSummary(data.summary);
        setHistory(data.history);
        setWithdrawRequest(data.withdrawRequest);
        setMinWithdrawTon(data.minWithdrawTon ?? 5);
        setWithdrawPreview(data.withdrawPreview);
        if (data.walletAddress) {
          setWalletAddress(data.walletAddress);
          setWalletSaved(true);
        } else if (connectedWallet) {
          // Auto-fill from connected TonConnect wallet
          setWalletAddress(connectedWallet);
          // Auto-save it
          saveWallet(connectedWallet)
            .then(() => setWalletSaved(true))
            .catch(() => {}); // silently fail, user can save manually
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // If connected wallet changes and no wallet is saved yet, auto-update
  useEffect(() => {
    if (connectedWallet && !walletSaved && !walletEditing) {
      setWalletAddress(connectedWallet);
      saveWallet(connectedWallet)
        .then(() => setWalletSaved(true))
        .catch(() => {});
    }
  }, [connectedWallet]);

  const handleSaveWallet = async () => {
    if (withdrawRequest?.status === 'pending' || withdrawRequest?.status === 'awaiting_tx_link') {
      setWalletError('Wallet is locked while withdraw request is active');
      return;
    }
    const trimmed = walletAddress.trim();
    if (!trimmed) { setWalletError('Please enter a wallet address'); return; }
    if (trimmed.length < 20) { setWalletError('Wallet address is too short'); return; }
    setWalletSaving(true);
    setWalletError('');
    try {
      await saveWallet(trimmed);
      setWalletSaved(true);
      setWalletEditing(false);
    } catch (e) {
      setWalletError((e as Error).message);
    } finally {
      setWalletSaving(false);
    }
  };

  const handleWithdrawRequest = async () => {
    setWithdrawError('');
    setWithdrawing(true);
    try {
      const data = await createWithdrawRequest();
      setWithdrawRequest(data.request);
      setSummary((prev) => prev ? { ...prev, available_to_withdraw: 0 } : prev);
      setWithdrawPreview({ gross_amount: 0, fee_percent: 0, fee_amount: 0, net_amount: 0 });
    } catch (e) {
      setWithdrawError((e as Error).message);
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;
  if (error) return <Text color="danger">{error}</Text>;
  if (!summary) return null;
  const walletLocked = withdrawRequest?.status === 'pending' || withdrawRequest?.status === 'awaiting_tx_link';
  const belowMinWithdraw = summary.available_to_withdraw < minWithdrawTon;

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
          <Text type="caption2" color="secondary">Platform Fees</Text>
          <div className="earnings-card-value" style={{ color: 'var(--tg-hint)' }}>{summary.platform_fees} TON</div>
        </div>
      </div>

      <div className="wallet-payout-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text type="caption1" weight="bold">Withdraw</Text>
          <Text type="caption2" color="secondary">Available: {summary.available_to_withdraw} TON</Text>
        </div>
        <button
          className="action-btn action-btn-approve"
          style={{ width: '100%' }}
          disabled={
            withdrawing
            || summary.available_to_withdraw <= 0
            || belowMinWithdraw
            || !walletSaved
            || withdrawRequest?.status === 'pending'
            || withdrawRequest?.status === 'awaiting_tx_link'
          }
          onClick={handleWithdrawRequest}
        >
          {withdrawing ? 'Submitting...' : 'Withdraw Request'}
        </button>
        {!walletSaved && (
          <div style={{ marginTop: 6 }}>
            <Text type="caption2" color="tertiary">Save a payout wallet first.</Text>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <Text type="caption2" color="secondary">
            If you withdraw now: Platform fee {withdrawPreview.fee_percent}% ({withdrawPreview.fee_amount} TON)
          </Text>
          <Text type="caption2" color="tertiary">
            You will receive: {withdrawPreview.net_amount} TON
          </Text>
        </div>
        {walletSaved && belowMinWithdraw && (
          <div style={{ marginTop: 6 }}>
            <Text type="caption2" color="tertiary">Minimum withdraw amount is {minWithdrawTon} TON.</Text>
          </div>
        )}
        {withdrawError && (
          <div style={{ marginTop: 6 }}>
            <Text type="caption2" color="danger">{withdrawError}</Text>
          </div>
        )}
      </div>

      {withdrawRequest && (
        <div style={{ marginBottom: 14 }}>
          <Group header="Latest Withdraw Request">
            <GroupItem text="Request ID" after={<Text type="body" weight="bold">#{withdrawRequest.id}</Text>} />
            <GroupItem text="Amount" after={<Text type="body" weight="bold">{withdrawRequest.amount} TON</Text>} />
            <GroupItem text="Status" after={<Text type="body" color="secondary">{withdrawRequest.status}</Text>} />
            {withdrawRequest.tx_link && (
              <GroupItem
                text="Blockchain TX"
                after={(
                  <a
                    href={withdrawRequest.tx_link}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'rgba(0, 122, 255, 0.12)',
                      color: '#007aff',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Open TX
                  </a>
                )}
              />
            )}
          </Group>
        </div>
      )}

      {/* Payout Wallet */}
      <div className="wallet-payout-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text type="caption1" weight="bold">Payout Wallet</Text>
          {walletSaved && !walletEditing && !walletLocked && (
            <button className="wallet-edit-btn" onClick={() => setWalletEditing(true)}>Edit</button>
          )}
        </div>
        {walletLocked && (
          <div style={{ marginBottom: 8 }}>
            <Text type="caption2" color="tertiary">Wallet is locked until this withdraw request is completed.</Text>
          </div>
        )}
        {walletSaved && !walletEditing ? (
          <div className="wallet-address-display">
            <span className="wallet-dot-green" />
            <span className="wallet-address-text">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</span>
          </div>
        ) : (
          <>
            <input
              className="form-input"
              value={walletAddress}
              type="text"
              placeholder="Your TON wallet address"
              onChange={(e) => setWalletAddress(e.target.value)}
            />
            {walletError && (
              <div style={{ marginTop: 4 }}>
                <Text type="caption2" color="danger">{walletError}</Text>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="action-btn action-btn-approve"
                style={{ flex: 1 }}
                onClick={handleSaveWallet}
                disabled={walletSaving || !walletAddress.trim() || walletLocked}
              >
                {walletSaving ? 'Saving...' : '💾 Save'}
              </button>
              {walletEditing && (
                <button
                  className="action-btn action-btn-ghost"
                  style={{ flex: 0 }}
                  onClick={() => { setWalletEditing(false); setWalletError(''); }}
                >
                  Cancel
                </button>
              )}
            </div>
            <Text type="caption2" color="tertiary" className="form-hint">
              Earnings will be sent to this address after the 3-day hold period.
            </Text>
          </>
        )}
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
        <GroupItem text="Platform fee" after={<Text type="body" weight="bold">Tiered by amount</Text>} />
        <GroupItem text="Hold period" after={<Text type="body" weight="bold">3 days</Text>} />
        <GroupItem text="" description="Fee percent depends on amount tier. Earnings are held for 3 days after the deal completes, then transferred to your account." />
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
            <Group header={`@${e.channel_username} · #${e.deal_id}`}>
              <GroupItem
                text="Status"
                after={(
                  <span className="status-pill" style={{
                    background: e.status === 'paid' ? 'rgba(52,199,89,0.12)' : 'rgba(0,122,255,0.12)',
                    color: e.status === 'paid' ? '#34c759' : '#007aff',
                  }}>
                    {e.status === 'paid' ? 'Paid' : 'Pending'}
                  </span>
                )}
              />
              <GroupItem text="Payment" after={<Text type="body" weight="bold">{e.gross_amount} TON</Text>} />
              <GroupItem text="Platform Fee" after={<Text type="body" color="secondary">-{e.platform_fee} TON</Text>} />
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
