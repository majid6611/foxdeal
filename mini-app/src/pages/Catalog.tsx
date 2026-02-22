import { useEffect, useState } from 'react';
import { favoriteChannel, getChannels, unfavoriteChannel, type Channel } from '../api';
import { Text, Spinner } from '@telegram-tools/ui-kit';

const CATEGORIES = ['all', 'favorites', 'news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'] as const;
type CategoryFilter = typeof CATEGORIES[number];

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

interface ProFilters {
  category: CategoryFilter;
  minSubscribers: number;
  minAvgViews: number;
  minStars: number;
}

const STAR_OPTIONS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

const DEFAULT_PRO_FILTERS: ProFilters = {
  category: 'all',
  minSubscribers: 0,
  minAvgViews: 0,
  minStars: 0,
};

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function clampStars(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 5) return 5;
  return value;
}

export function Catalog({ onSelect }: { onSelect: (ch: Channel) => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [sortBy, setSortBy] = useState<'subs_desc' | 'subs_asc' | 'rating_desc' | 'rating_asc' | 'completed_desc' | 'completed_asc'>('subs_desc');
  const [updatingFavoriteId, setUpdatingFavoriteId] = useState<number | null>(null);
  const [showProFilter, setShowProFilter] = useState(false);
  const [proFilters, setProFilters] = useState<ProFilters>(DEFAULT_PRO_FILTERS);
  const [draftProFilters, setDraftProFilters] = useState<ProFilters>(DEFAULT_PRO_FILTERS);

  const loadChannels = async (filters: ProFilters) => {
    setLoading(true);
    setLoadError('');
    try {
      const next = await getChannels({
        category: filters.category === 'all' || filters.category === 'favorites' ? undefined : filters.category,
        minSubscribers: filters.minSubscribers > 0 ? filters.minSubscribers : undefined,
        minAvgViews: filters.minAvgViews > 0 ? filters.minAvgViews : undefined,
        minStars: filters.minStars > 0 ? filters.minStars : undefined,
        favoriteOnly: filters.category === 'favorites',
      });
      setChannels(next);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChannels(DEFAULT_PRO_FILTERS);
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;
  if (loadError) return <Text color="danger">{loadError}</Text>;

  const activeFilterCount = Number(proFilters.category !== 'all')
    + Number(proFilters.minSubscribers > 0)
    + Number(proFilters.minAvgViews > 0)
    + Number(proFilters.minStars > 0);

  const filtered = channels;

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

  const openProFilter = () => {
    setDraftProFilters(proFilters);
    setShowProFilter(true);
  };

  const applyProFilter = () => {
    const normalized: ProFilters = {
      category: draftProFilters.category,
      minSubscribers: clampNonNegative(Math.floor(Number(draftProFilters.minSubscribers))),
      minAvgViews: clampNonNegative(Math.floor(Number(draftProFilters.minAvgViews))),
      minStars: clampStars(Number(draftProFilters.minStars)),
    };
    setProFilters(normalized);
    void loadChannels(normalized);
    setShowProFilter(false);
  };

  const resetProFilter = () => {
    setDraftProFilters(DEFAULT_PRO_FILTERS);
    setProFilters(DEFAULT_PRO_FILTERS);
    void loadChannels(DEFAULT_PRO_FILTERS);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Browse Channels</div>
        <div className="page-subtitle">Find the perfect channel for your ad</div>
      </div>
      {actionError && <Text color="danger" type="caption1">{actionError}</Text>}

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
        <button type="button" className="catalog-pro-filter-btn" onClick={openProFilter}>
          <span className="catalog-pro-filter-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 4.5a6.5 6.5 0 1 0 4.03 11.6l4.44 4.44a1 1 0 0 0 1.42-1.42l-4.44-4.44A6.5 6.5 0 0 0 11 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Smart Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty" style={{ paddingTop: 24 }}>
          <div className="empty-icon">{activeFilterCount > 0 ? '📭' : '🦊'}</div>
          <Text type="body" color="secondary">
            {activeFilterCount > 0 ? 'No channels match your current filters.' : 'No channels listed yet.'}
          </Text>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="catalog-empty-reset-btn"
              onClick={resetProFilter}
            >
              Clear filters
            </button>
          ) : (
            <Text type="caption1" color="tertiary">Be the first to list your channel on Fox Deal!</Text>
          )}
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

      {showProFilter && (
        <div className="pro-filter-overlay" role="dialog" aria-modal="true" aria-label="Pro filter modal">
          <div className="pro-filter-backdrop" onClick={() => setShowProFilter(false)} />
          <div className="pro-filter-modal">
            <div className="pro-filter-title">Smart Filter</div>
            <div className="pro-filter-subtitle">Fine-tune channel selection</div>

            <div className="pro-filter-field">
              <label htmlFor="pro-filter-category" className="pro-filter-label">Category</label>
              <select
                id="pro-filter-category"
                className="pro-filter-input"
                value={draftProFilters.category}
                onChange={(e) => setDraftProFilters((prev) => ({ ...prev, category: e.target.value as CategoryFilter }))}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'all'
                      ? 'All categories'
                      : cat === 'favorites'
                        ? '❤️ Favorites'
                        : `${CAT_ICONS[cat] || ''} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="pro-filter-field">
              <label htmlFor="pro-filter-subscribers" className="pro-filter-label">Min subscribers</label>
              <input
                id="pro-filter-subscribers"
                className="pro-filter-input"
                type="number"
                min="0"
                step="1"
                value={draftProFilters.minSubscribers === 0 ? '' : draftProFilters.minSubscribers}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraftProFilters((prev) => ({ ...prev, minSubscribers: raw === '' ? 0 : Number(raw) }));
                }}
                placeholder="e.g. 10000"
              />
            </div>

            <div className="pro-filter-field">
              <label htmlFor="pro-filter-views" className="pro-filter-label">Min avg views</label>
              <input
                id="pro-filter-views"
                className="pro-filter-input"
                type="number"
                min="0"
                step="1"
                value={draftProFilters.minAvgViews === 0 ? '' : draftProFilters.minAvgViews}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraftProFilters((prev) => ({ ...prev, minAvgViews: raw === '' ? 0 : Number(raw) }));
                }}
                placeholder="e.g. 100"
              />
            </div>

            <div className="pro-filter-field">
              <label htmlFor="pro-filter-stars" className="pro-filter-label">Min stars (0 - 5)</label>
              <select
                id="pro-filter-stars"
                className="pro-filter-input"
                value={draftProFilters.minStars}
                onChange={(e) => setDraftProFilters((prev) => ({ ...prev, minStars: Number(e.target.value) }))}
              >
                {STAR_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? 'Any rating' : `${value.toFixed(1)}+`}
                  </option>
                ))}
              </select>
            </div>

            <div className="pro-filter-actions">
              <button type="button" className="pro-filter-btn ghost" onClick={resetProFilter}>Reset</button>
              <button type="button" className="pro-filter-btn ghost" onClick={() => setShowProFilter(false)}>Cancel</button>
              <button type="button" className="pro-filter-btn primary" onClick={applyProFilter}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
