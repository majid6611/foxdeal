import { useEffect, useState } from 'react';
import { getMyChannels, deleteChannel, activateChannel, createChannel, type Channel } from '../api';

const CATEGORIES = ['news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'];

export function MyChannel({ onBack }: { onBack: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<number | null>(null);

  // Add-channel form state
  const [showForm, setShowForm] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [category, setCategory] = useState('general');
  const [price, setPrice] = useState('');
  const [durationHours, setDurationHours] = useState('24');
  const [cpcPrice, setCpcPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadChannels = () => {
    setLoading(true);
    getMyChannels()
      .then(setChannels)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadChannels();
  }, []);

  const handleDeactivate = async (id: number) => {
    if (!confirm('Deactivate this channel? It will be hidden from the catalog.')) return;
    setActionId(id);
    try {
      await deleteChannel(id);
      setChannels((prev) => prev.map((ch) =>
        ch.id === id ? { ...ch, is_active: false } : ch
      ));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionId(null);
    }
  };

  const handleActivate = async (id: number) => {
    setActionId(id);
    setError('');
    try {
      await activateChannel(id);
      setChannels((prev) => prev.map((ch) =>
        ch.id === id ? { ...ch, is_active: true } : ch
      ));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionId(null);
    }
  };

  const handleAddChannel = async () => {
    if (!channelId.trim() || !price) {
      setError('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await createChannel({
        telegramChannelId: channelId.startsWith('@') ? channelId : `@${channelId}`,
        category,
        price: Number(price),
        durationHours: Number(durationHours),
        cpcPrice: cpcPrice ? Number(cpcPrice) : 0,
      });
      // Reset form and reload list
      setChannelId('');
      setCategory('general');
      setPrice('');
      setDurationHours('24');
      setCpcPrice('');
      setShowForm(false);
      loadChannels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading">Loading your channels...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>My Channels</h2>
        <button
          className="btn btn-primary"
          style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Add Channel'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Inline add-channel form */}
      {showForm && (
        <div className="card" style={{ cursor: 'default', marginBottom: 16, borderColor: 'rgba(255, 107, 43, 0.3)' }}>
          <div className="card-title" style={{ marginBottom: 12 }}>List Your Channel</div>

          <div className="form-group">
            <label className="form-label">Channel Username</label>
            <input
              className="form-input"
              placeholder="@yourchannel"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            />
            <div style={{ fontSize: 12, color: 'var(--tg-hint)', marginTop: 4 }}>
              Bot must be added as admin to this channel first.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="separator" style={{ margin: '12px 0' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tg-text)', marginBottom: 10 }}>
            Time-based Pricing
          </div>

          <div className="form-group">
            <label className="form-label">Price (Telegram Stars)</label>
            <input
              className="form-input"
              type="number"
              min="1"
              placeholder="100"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Ad Duration (hours)</label>
            <input
              className="form-input"
              type="number"
              min="1"
              placeholder="24"
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
            />
          </div>

          <div className="separator" style={{ margin: '12px 0' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tg-text)', marginBottom: 4 }}>
            Cost-per-Click Pricing (optional)
          </div>
          <div style={{ fontSize: 12, color: 'var(--tg-hint)', marginBottom: 10 }}>
            Set a per-click price so advertisers can pay only for clicks. Leave empty to disable CPC.
          </div>

          <div className="form-group">
            <label className="form-label">CPC Price (Stars per click)</label>
            <input
              className="form-input"
              type="number"
              min="0.1"
              step="0.1"
              placeholder="e.g. 0.5 or 5 (leave empty to disable)"
              value={cpcPrice}
              onChange={(e) => setCpcPrice(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleAddChannel}
            disabled={submitting}
          >
            {submitting ? 'Listing...' : 'List Channel'}
          </button>
        </div>
      )}

      {/* Channel list */}
      {channels.length === 0 && !showForm ? (
        <div className="empty">
          <div className="empty-icon">📡</div>
          <p>You haven't listed any channels yet.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Tap "+ Add Channel" above to get started.
          </p>
        </div>
      ) : (
        channels.map((ch) => (
          <div key={ch.id} className="card" style={{ cursor: 'default' }}>
            <div className="card-header">
              <div>
                <div className="card-title">@{ch.username}</div>
                <div className="card-subtitle">{ch.category}</div>
              </div>
              <span className={`card-badge ${
                ch.approval_status === 'pending' ? 'status-pending' :
                ch.approval_status === 'rejected' ? 'status-rejected' :
                ch.is_active ? 'status-completed' : 'status-rejected'
              }`}>
                {ch.approval_status === 'pending' ? '⏳ Pending Review' :
                 ch.approval_status === 'rejected' ? '❌ Rejected' :
                 ch.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="detail-section" style={{ marginTop: 12 }}>
              <div className="detail-row">
                <span>Subscribers</span>
                <strong>{ch.subscribers.toLocaleString()}</strong>
              </div>
              <div className="detail-row">
                <span>Time Price</span>
                <strong className="price-tag">{ch.price} Stars / {ch.duration_hours}h</strong>
              </div>
              {ch.cpc_price > 0 && (
                <div className="detail-row">
                  <span>CPC Price</span>
                  <strong style={{ color: '#27bcff' }}>{ch.cpc_price} Stars/click</strong>
                </div>
              )}
              <div className="detail-row">
                <span>Bot Admin</span>
                <strong>{ch.bot_is_admin ? 'Yes' : 'No'}</strong>
              </div>
            </div>

            {ch.approval_status === 'pending' && (
              <div className="info-card" style={{ marginTop: 12, padding: '10px 14px' }}>
                Your channel is under review by the Fox Deal team. You'll receive a notification once it's approved.
              </div>
            )}

            {ch.approval_status === 'rejected' && (
              <div className="info-card" style={{ marginTop: 12, padding: '10px 14px', borderColor: 'var(--fox-danger)' }}>
                This channel was not approved. Please contact support for more details.
              </div>
            )}

            {ch.approval_status === 'approved' && ch.is_active && (
              <button
                className="btn btn-danger"
                style={{ marginTop: 12 }}
                onClick={() => handleDeactivate(ch.id)}
                disabled={actionId === ch.id}
              >
                {actionId === ch.id ? 'Deactivating...' : 'Deactivate Channel'}
              </button>
            )}

            {ch.approval_status === 'approved' && !ch.is_active && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                onClick={() => handleActivate(ch.id)}
                disabled={actionId === ch.id}
              >
                {actionId === ch.id ? 'Activating...' : 'Activate Channel'}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
