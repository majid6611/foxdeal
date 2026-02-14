import { useEffect, useState } from 'react';
import { getChannels, type Channel } from '../api';

const CATEGORIES = ['all', 'news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'];

export function Catalog({ onSelect }: { onSelect: (ch: Channel) => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    getChannels()
      .then(setChannels)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading channels...</div>;
  if (error) return <div className="error">{error}</div>;

  const filtered = filter === 'all'
    ? channels
    : channels.filter((ch) => ch.category === filter);

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

      {/* Category filter chips */}
      <div className="filter-chips">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`filter-chip ${filter === cat ? 'active' : ''}`}
            onClick={() => setFilter(cat)}
          >
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty" style={{ paddingTop: 24 }}>
          <div className="empty-icon">📭</div>
          <p>No channels in this category yet.</p>
        </div>
      ) : (
        filtered.map((ch) => (
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
              <span className="price-tag">{ch.price} Stars / {ch.duration_hours}h</span>
              {ch.cpc_price > 0 && (
                <span style={{ fontSize: 12, color: '#27bcff', fontWeight: 500 }}>
                  CPC: {ch.cpc_price} Stars/click
                </span>
              )}
              {ch.cpc_price <= 0 && (
                <span style={{ fontSize: 13, color: 'var(--tg-hint)' }}>
                  Time-based only
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
