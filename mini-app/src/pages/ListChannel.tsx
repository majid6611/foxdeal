import { useState } from 'react';
import { createChannel } from '../api';
import { Button, Text } from '@telegram-tools/ui-kit';

const CATEGORIES = ['news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'];

export function ListChannel({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const [channelId, setChannelId] = useState('');
  const [category, setCategory] = useState('general');
  const [price, setPrice] = useState('');
  const [durationHours, setDurationHours] = useState('24');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!channelId.trim() || !price) { setError('Please fill in all fields'); return; }
    setSubmitting(true); setError('');
    try {
      await createChannel({
        telegramChannelId: channelId.startsWith('@') ? channelId : `@${channelId}`,
        category,
        price: Number(price),
        durationHours: Number(durationHours),
      });
      onCreated();
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="page-header">
        <div className="page-title">List Your Channel</div>
        <div className="page-subtitle">Start earning from ad placements</div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="section-gap">
        <Text type="caption1" color="secondary" className="form-label-tg">Channel Username</Text>
        <input className="form-input" value={channelId} placeholder="@yourchannel" onChange={(e) => setChannelId(e.target.value)} />
        <Text type="caption2" color="tertiary" className="form-hint">Bot must be admin in this channel.</Text>
      </div>

      <div className="section-gap">
        <Text type="caption1" color="secondary" className="form-label-tg">Category</Text>
        <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      <div className="section-gap">
        <Text type="caption1" color="secondary" className="form-label-tg">Price (TON)</Text>
        <input className="form-input" type="number" min="1" value={price} placeholder="100" onChange={(e) => setPrice(e.target.value)} />
      </div>

      <div className="section-gap">
        <Text type="caption1" color="secondary" className="form-label-tg">Duration (hours)</Text>
        <input className="form-input" type="number" min="1" value={durationHours} placeholder="24" onChange={(e) => setDurationHours(e.target.value)} />
      </div>

      <div style={{ marginTop: 20 }}>
        <Button text={submitting ? 'Listing...' : 'List Channel'} type="primary" onClick={handleSubmit} disabled={submitting} loading={submitting} />
      </div>
    </div>
  );
}
