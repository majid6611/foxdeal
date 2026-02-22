import { useEffect, useRef, useState } from 'react';
import {
  getMyChannels,
  deleteChannel,
  activateChannel,
  createChannel,
  resubmitChannel,
  removeChannel,
  type Channel,
} from '../api';
import { Button, Group, GroupItem, Text, Spinner } from '@telegram-tools/ui-kit';

const CATEGORIES = ['news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'];
const DEMO_APPROVAL_LINK = 'https://t.me/foxdealadmin';
const DEMO_APPROVAL_HANDLE = '@foxdealadmin';

function formatChannelRating(ch: Channel): string {
  const avg = Number(ch.rating_avg);
  const count = Number(ch.rating_count);
  if (!Number.isFinite(count) || count <= 0) return 'No ratings yet';
  const safeAvg = Number.isFinite(avg) ? avg : 0;
  return `${safeAvg.toFixed(1)} (${count.toLocaleString()})`;
}

function formatCompletedAds(ch: Channel): string {
  const completed = Number(ch.completed_deals_count);
  if (!Number.isFinite(completed) || completed <= 0) return '0';
  return completed.toLocaleString();
}

function formatTonAmount(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function approvalColor(ch: Channel) {
  if (ch.approval_status === 'pending') return { bg: 'rgba(255,149,0,0.12)', color: '#ff9500', label: '⏳ Pending' };
  if (ch.approval_status === 'rejected') return { bg: 'rgba(255,59,48,0.12)', color: '#ff3b30', label: '❌ Rejected' };
  if (ch.is_active) return { bg: 'rgba(52,199,89,0.12)', color: '#34c759', label: '● Active' };
  return { bg: 'rgba(142,142,147,0.12)', color: '#8e8e93', label: '○ Inactive' };
}

export function MyChannel({ onBack }: { onBack: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [category, setCategory] = useState('general');
  const [price, setPrice] = useState('');
  const [durationHours, setDurationHours] = useState('24');
  const [cpcPrice, setCpcPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingRejectedChannelId, setEditingRejectedChannelId] = useState<number | null>(null);
  const [demoNotice, setDemoNotice] = useState('');
  const errorRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const cpcValue = Number(cpcPrice);
  const clicksPerTon = cpcValue > 0 ? 1 / cpcValue : null;
  const formattedClicksPerTon = clicksPerTon === null
    ? null
    : Number.isInteger(clicksPerTon)
      ? clicksPerTon.toLocaleString()
      : clicksPerTon.toFixed(2).replace(/\.?0+$/, '');

  const handleDeactivate = async (id: number) => {
    if (!confirm('Deactivate this channel? It will be hidden from the catalog.')) return;
    setActionId(id);
    try { await deleteChannel(id); setChannels((p) => p.map((c) => c.id === id ? { ...c, is_active: false } : c)); }
    catch (e) { setError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleActivate = async (id: number) => {
    setActionId(id); setError('');
    try { await activateChannel(id); setChannels((p) => p.map((c) => c.id === id ? { ...c, is_active: true } : c)); }
    catch (e) { setError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleAddChannel = async () => {
    if (!channelId.trim() || !price) { setError('Please fill in all required fields'); return; }
    setSubmitting(true); setError('');
    try {
      if (editingRejectedChannelId) {
        await resubmitChannel(editingRejectedChannelId, {
          category,
          price: Number(price),
          durationHours: Number(durationHours),
          cpcPrice: cpcPrice ? Number(cpcPrice) : 0,
        });
      } else {
        await createChannel({
          telegramChannelId: channelId.startsWith('@') ? channelId : `@${channelId}`,
          category,
          price: Number(price),
          durationHours: Number(durationHours),
          cpcPrice: cpcPrice ? Number(cpcPrice) : 0,
        });
      }
      setDemoNotice('show');
      setChannelId(''); setCategory('general'); setPrice(''); setDurationHours('24'); setCpcPrice('');
      setEditingRejectedChannelId(null);
      setShowForm(false); loadChannels();
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleEditRejected = (channel: Channel) => {
    setError('');
    setEditingRejectedChannelId(channel.id);
    setChannelId(`@${channel.username}`);
    setCategory(channel.category);
    setPrice(String(channel.price));
    setDurationHours(String(channel.duration_hours));
    setCpcPrice(channel.cpc_price > 0 ? String(channel.cpc_price) : '');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRemoveRejected = async (id: number) => {
    if (!confirm('Remove this rejected channel permanently?')) return;
    setActionId(id); setError('');
    try {
      await removeChannel(id);
      setChannels((p) => p.filter((c) => c.id !== id));
      if (editingRejectedChannelId === id) {
        setEditingRejectedChannelId(null);
        setShowForm(false);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setActionId(null); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div className="page-title">My Channels</div>
          <div className="page-subtitle">{channels.length} channel{channels.length !== 1 ? 's' : ''}</div>
        </div>
        <button
          className={`add-channel-btn ${showForm ? 'cancel' : ''}`}
          onClick={() => {
            if (showForm) {
              setEditingRejectedChannelId(null);
              setChannelId('');
              setCategory('general');
              setPrice('');
              setDurationHours('24');
              setCpcPrice('');
            }
            setShowForm(!showForm);
          }}
        >
          {showForm ? '✕ Cancel' : '+ Add Channel'}
        </button>
      </div>

      {error && <div ref={errorRef} className="error">{error}</div>}
      {demoNotice && (
        <div
          style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #ff9500',
            background: 'rgba(255,149,0,0.14)',
            color: '#ffb340',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          Important Notice (Demo Day): Please join here to approval{' '}
          <a href={DEMO_APPROVAL_LINK} target="_blank" rel="noopener noreferrer" style={{ color: '#ffd27f', textDecoration: 'underline' }}>
            {DEMO_APPROVAL_HANDLE}
          </a>
        </div>
      )}

      {showForm && (
        <div className="form-card">
          <Text type="title3" weight="bold">{editingRejectedChannelId ? 'Edit & Resubmit Channel' : 'List Your Channel'}</Text>

          <div className="section-gap">
            <Text type="caption1" color="secondary" className="form-label-tg">Channel Username</Text>
            <input
              className="form-input"
              value={channelId}
              placeholder="@yourchannel"
              onChange={(e) => setChannelId(e.target.value)}
              disabled={editingRejectedChannelId !== null}
            />
            <Text type="caption2" color="tertiary" className="form-hint">
              {editingRejectedChannelId ? 'Channel username is fixed for resubmission.' : 'Bot must be admin in this channel.'}
            </Text>
          </div>

          <div className="section-gap">
            <Text type="caption1" color="secondary" className="form-label-tg">Category</Text>
            <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>

          <div className="section-divider"><span className="section-divider-text">Time-based Pricing</span></div>

          <div className="section-gap">
            <Text type="caption1" color="secondary" className="form-label-tg">Price (TON)</Text>
            <input className="form-input" type="number" min="1" value={price} placeholder="100" onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="section-gap">
            <Text type="caption1" color="secondary" className="form-label-tg">Duration (hours)</Text>
            <input className="form-input" type="number" min="1" value={durationHours} placeholder="24" onChange={(e) => setDurationHours(e.target.value)} />
          </div>

          <div className="section-divider"><span className="section-divider-text">CPC Pricing (optional)</span></div>
          <Text type="caption2" color="tertiary">Let advertisers pay per click instead.</Text>

          <div className="section-gap">
            <Text type="caption1" color="secondary" className="form-label-tg">CPC Price (TON/click)</Text>
            <input className="form-input" type="number" min="0.001" step="0.001" value={cpcPrice} placeholder="e.g. 0.02 or 0.5" onChange={(e) => setCpcPrice(e.target.value)} />
            {formattedClicksPerTon && (
              <Text type="caption2" color="tertiary" className="form-hint">
                1 TON = {formattedClicksPerTon} clicks at {cpcValue} TON/click
              </Text>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <Button
              text={submitting ? (editingRejectedChannelId ? 'Resubmitting...' : 'Listing...') : (editingRejectedChannelId ? 'Resubmit for Review' : 'List Channel')}
              type="primary"
              onClick={handleAddChannel}
              disabled={submitting}
              loading={submitting}
            />
          </div>
        </div>
      )}

      {channels.length === 0 && !showForm ? (
        <div className="empty">
          <div className="empty-icon">📡</div>
          <Text type="body" color="secondary">No channels listed yet.</Text>
          <Text type="caption1" color="tertiary">Tap "+ Add" to get started.</Text>
        </div>
      ) : (
        channels.map((ch) => {
          const st = approvalColor(ch);
          return (
            <div key={ch.id} style={{ marginBottom: 12 }}>
              <Group
                header={(
                  <a
                    href={`https://t.me/${ch.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--tg-link)', textDecoration: 'none', fontWeight: 700 }}
                  >
                    @{ch.username}
                  </a>
                )}
                footer={ch.category}
              >
                <GroupItem
                  text="Status"
                  after={<span className="status-pill" style={{ background: st.bg, color: st.color }}>{st.label}</span>}
                />
                <GroupItem text="Subscribers" after={<Text type="body" weight="bold">{ch.subscribers.toLocaleString()}</Text>} />
                <GroupItem text="Rating" after={<Text type="body" weight="bold">⭐ {formatChannelRating(ch)}</Text>} />
                <GroupItem text="Completed Ads" after={<Text type="body" weight="bold">{formatCompletedAds(ch)}</Text>} />
                <GroupItem text="Earned (Net)" after={<Text type="body" color="accent" weight="bold">{formatTonAmount(ch.earned_net)} TON</Text>} />
                <GroupItem text="Time Price" after={<Text type="body" color="accent" weight="bold">{ch.price} TON / {ch.duration_hours}h</Text>} />
                {ch.cpc_price > 0 && (
                  <GroupItem text="CPC Price" after={<Text type="body" color="accent">{ch.cpc_price} TON/click</Text>} />
                )}
                <GroupItem text="Bot Admin" after={<span style={{ fontSize: 16 }}>{ch.bot_is_admin ? '✅' : '❌'}</span>} />

                {ch.approval_status === 'pending' && (
                  <GroupItem text="" description="Under review by Fox Deal team. You'll be notified once approved." />
                )}
                {ch.approval_status === 'rejected' && (
                  <GroupItem text="" description="Channel was not approved. Update details and resubmit for review." />
                )}
                {ch.approval_status === 'rejected' && (
                  <GroupItem
                    text={actionId === ch.id ? 'Opening...' : '✏️ Edit & Resubmit'}
                    onClick={() => handleEditRejected(ch)}
                    disabled={actionId === ch.id}
                  />
                )}
                {ch.approval_status === 'rejected' && (
                  <GroupItem
                    text={actionId === ch.id ? 'Removing...' : '🗑 Remove Channel'}
                    onClick={() => handleRemoveRejected(ch.id)}
                    disabled={actionId === ch.id}
                  />
                )}
                {ch.approval_status === 'approved' && ch.is_active && (
                  <GroupItem
                    text={actionId === ch.id ? 'Deactivating...' : '⏸ Deactivate Channel'}
                    onClick={() => handleDeactivate(ch.id)}
                    disabled={actionId === ch.id}
                  />
                )}
                {ch.approval_status === 'approved' && !ch.is_active && (
                  <GroupItem
                    text={actionId === ch.id ? 'Activating...' : '▶ Activate Channel'}
                    onClick={() => handleActivate(ch.id)}
                    disabled={actionId === ch.id}
                  />
                )}
              </Group>
            </div>
          );
        })
      )}
    </div>
  );
}
