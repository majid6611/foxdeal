import { useState } from 'react';
import { createChannel } from '../api';

const CATEGORIES = ['news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'];

export function ListChannel({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const [channelId, setChannelId] = useState('');
  const [category, setCategory] = useState('general');
  const [price, setPrice] = useState('');
  const [durationHours, setDurationHours] = useState('24');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!channelId.trim() || !price) {
      setError('Please fill in all fields');
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
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h2 className="section-title" style={{ marginBottom: 16 }}>List Your Channel</h2>

      {error && <div className="error">{error}</div>}

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

      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? 'Listing...' : 'List Channel'}
      </button>
    </div>
  );
}
