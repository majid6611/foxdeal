import { useEffect, useState } from 'react';
import { getChannels, type Channel } from '../api';

export function Catalog({ onSelect }: { onSelect: (ch: Channel) => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getChannels()
      .then(setChannels)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading channels...</div>;
  if (error) return <div className="error">{error}</div>;

  if (channels.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🦊</div>
        <p>No channels listed yet.</p>
        <p style={{ fontSize: 13, marginTop: 8 }}>Be the first to list your channel on Fox Deal!</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title">Browse Channels</h2>
      <p className="section-subtitle">Find the perfect channel for your ad</p>
      {channels.map((ch) => (
        <div key={ch.id} className="card" onClick={() => onSelect(ch)}>
          <div className="card-header">
            <div>
              <div className="card-title">@{ch.username}</div>
              <div className="card-subtitle">{ch.category}</div>
            </div>
            <span className="card-badge status-approved">
              {ch.subscribers.toLocaleString()} subs
            </span>
          </div>
          <div className="card-row">
            <span className="price-tag">{ch.price} Stars</span>
            <span style={{ fontSize: 13, color: 'var(--tg-hint)' }}>
              {ch.duration_hours}h duration
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
