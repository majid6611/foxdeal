import { useEffect, useState } from 'react';
import { getChannels, type Channel } from '../api';
import { Text, Spinner } from '@telegram-tools/ui-kit';

const CATEGORIES = ['all', 'news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'];

const CAT_ICONS: Record<string, string> = {
  news: '📰', tech: '💻', crypto: '₿', entertainment: '🎬',
  education: '📚', lifestyle: '✨', business: '💼', general: '📢',
};

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

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;
  if (error) return <Text color="danger">{error}</Text>;

  const filtered = filter === 'all'
    ? channels
    : channels.filter((ch) => ch.category === filter);

  if (channels.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🦊</div>
        <Text type="body" color="secondary">No channels listed yet.</Text>
        <Text type="caption1" color="tertiary">Be the first to list your channel on Fox Deal!</Text>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Browse Channels</div>
        <div className="page-subtitle">Find the perfect channel for your ad</div>
      </div>

      <div className="filter-chips">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`filter-chip ${filter === cat ? 'active' : ''}`}
            onClick={() => setFilter(cat)}
          >
            {cat === 'all' ? '🔥 All' : `${CAT_ICONS[cat] || ''} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty" style={{ paddingTop: 24 }}>
          <div className="empty-icon">📭</div>
          <Text type="body" color="secondary">No channels in this category yet.</Text>
        </div>
      ) : (
        <div className="catalog-grid">
          {filtered.map((ch) => (
            <div key={ch.id} className="catalog-card" onClick={() => onSelect(ch)}>
              {/* Top section */}
              <div className="catalog-card-top">
                {ch.photo_url ? (
                  <img src={ch.photo_url} alt="" className="catalog-card-photo" />
                ) : (
                  <div className="catalog-card-icon">
                    {CAT_ICONS[ch.category] || '📢'}
                  </div>
                )}
                <div className="catalog-card-subs">
                  <span className="catalog-card-subs-num">{ch.subscribers >= 1000 ? `${(ch.subscribers / 1000).toFixed(ch.subscribers >= 10000 ? 0 : 1)}K` : ch.subscribers}</span>
                  <span className="catalog-card-subs-label">subs</span>
                </div>
              </div>

              {/* Channel name */}
              <div className="catalog-card-name">@{ch.username}</div>
              <div className="catalog-card-cat">{ch.category}</div>

              {/* Pricing */}
              <div className="catalog-card-pricing">
                <div className="catalog-card-price-main">
                  <span className="catalog-card-price-value">{ch.price}</span>
                  <span className="catalog-card-price-unit">TON / {ch.duration_hours}h</span>
                </div>
                {ch.cpc_price > 0 && (
                  <div className="catalog-card-cpc">
                    {ch.cpc_price} TON/click
                  </div>
                )}
              </div>

              {/* Action hint */}
              <div className="catalog-card-action">
                View Details →
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
