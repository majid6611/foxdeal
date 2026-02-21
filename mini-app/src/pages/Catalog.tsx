import { useEffect, useRef, useState } from 'react';
import { favoriteChannel, getChannels, unfavoriteChannel, type Channel } from '../api';
import { Text, Spinner } from '@telegram-tools/ui-kit';

const CATEGORIES = ['all', 'favorites', 'news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'];

const CAT_ICONS: Record<string, string> = {
  news: '📰', tech: '💻', crypto: '₿', entertainment: '🎬',
  education: '📚', lifestyle: '✨', business: '💼', general: '📢',
};

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

export function Catalog({ onSelect }: { onSelect: (ch: Channel) => void }) {
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'subs_desc' | 'subs_asc' | 'rating_desc' | 'rating_asc' | 'completed_desc' | 'completed_asc'>('subs_desc');
  const [updatingFavoriteId, setUpdatingFavoriteId] = useState<number | null>(null);

  useEffect(() => {
    getChannels()
      .then(setChannels)
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;
  if (loadError) return <Text color="danger">{loadError}</Text>;

  const filtered = filter === 'all'
    ? channels
    : filter === 'favorites'
      ? channels.filter((ch) => ch.is_favorite)
      : channels.filter((ch) => ch.category === filter);

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'subs_asc') return a.subscribers - b.subscribers;
    if (sortBy === 'rating_desc') {
      const avgDiff = Number(b.rating_avg) - Number(a.rating_avg);
      if (avgDiff !== 0) return avgDiff;
      return Number(b.rating_count) - Number(a.rating_count);
    }
    if (sortBy === 'rating_asc') {
      const avgDiff = Number(a.rating_avg) - Number(b.rating_avg);
      if (avgDiff !== 0) return avgDiff;
      return Number(a.rating_count) - Number(b.rating_count);
    }
    if (sortBy === 'completed_desc') {
      return Number(b.completed_deals_count) - Number(a.completed_deals_count);
    }
    if (sortBy === 'completed_asc') {
      return Number(a.completed_deals_count) - Number(b.completed_deals_count);
    }
    return b.subscribers - a.subscribers;
  });

  if (channels.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🦊</div>
        <Text type="body" color="secondary">No channels listed yet.</Text>
        <Text type="caption1" color="tertiary">Be the first to list your channel on Fox Deal!</Text>
      </div>
    );
  }

  const handleFavoriteToggle = async (channelId: number, isFavorite: boolean) => {
    if (updatingFavoriteId === channelId) return;
    setUpdatingFavoriteId(channelId);
    setActionError('');

    setChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, is_favorite: !isFavorite } : ch)));
    try {
      if (isFavorite) {
        await unfavoriteChannel(channelId);
      } else {
        await favoriteChannel(channelId);
      }
    } catch (e) {
      setChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, is_favorite: isFavorite } : ch)));
      setActionError((e as Error).message);
    } finally {
      setUpdatingFavoriteId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Browse Channels</div>
        <div className="page-subtitle">Find the perfect channel for your ad</div>
      </div>
      {actionError && <Text color="danger" type="caption1">{actionError}</Text>}

      <div
        ref={chipsRef}
        className="filter-chips"
        onWheel={(e) => {
          // Desktop UX: convert vertical wheel into horizontal chip scrolling.
          if (!chipsRef.current) return;
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          if (chipsRef.current.scrollWidth <= chipsRef.current.clientWidth) return;
          e.preventDefault();
          chipsRef.current.scrollLeft += e.deltaY;
        }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`filter-chip ${filter === cat ? 'active' : ''}`}
            onClick={() => setFilter(cat)}
          >
            {cat === 'all'
              ? '🔥 All'
              : cat === 'favorites'
                ? '❤️ Favorites'
                : `${CAT_ICONS[cat] || ''} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`}
          </button>
        ))}
      </div>

      <div className="catalog-toolbar">
        <label htmlFor="catalog-sort" className="catalog-toolbar-label">Sort</label>
        <select
          id="catalog-sort"
          className="catalog-toolbar-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'subs_desc' | 'subs_asc' | 'rating_desc' | 'rating_asc' | 'completed_desc' | 'completed_asc')}
        >
          <option value="subs_desc">Subscribers: High to Low</option>
          <option value="subs_asc">Subscribers: Low to High</option>
          <option value="rating_desc">Rating: High to Low</option>
          <option value="rating_asc">Rating: Low to High</option>
          <option value="completed_desc">Completed Ads: High to Low</option>
          <option value="completed_asc">Completed Ads: Low to High</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="empty" style={{ paddingTop: 24 }}>
          <div className="empty-icon">📭</div>
          <Text type="body" color="secondary">No channels in this category yet.</Text>
        </div>
      ) : (
        <div className="catalog-grid">
          {sorted.map((ch) => (
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
              <div className="catalog-card-rating">⭐ {formatChannelRating(ch)}</div>
              <div className="catalog-card-cat">Completed ads: {formatCompletedAds(ch)}</div>
              {typeof ch.avg_post_views === 'number' && ch.avg_post_views > 0 && (
                <div className="catalog-card-cat">Avg views: {ch.avg_post_views.toLocaleString()}</div>
              )}

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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleFavoriteToggle(ch.id, Boolean(ch.is_favorite));
                }}
                disabled={updatingFavoriteId === ch.id}
                className="catalog-favorite-btn"
              >
                {ch.is_favorite ? '★ Favorited' : '☆ Add to favorites'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
