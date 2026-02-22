import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Spinner, Text } from '@telegram-tools/ui-kit';
import { createCampaign, favoriteChannel, searchChannels, unfavoriteChannel, uploadImage, type Channel } from '../api';

const CATEGORIES = ['news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'] as const;
type CategoryFilter = 'all' | 'favorites' | (typeof CATEGORIES)[number];
const CAT_ICONS: Record<(typeof CATEGORIES)[number], string> = {
  news: '📰',
  tech: '💻',
  crypto: '₿',
  entertainment: '🎬',
  education: '📚',
  lifestyle: '✨',
  business: '💼',
  general: '📢',
};
const STAR_OPTIONS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

interface SmartFilters {
  category: CategoryFilter;
  minSubscribers: number;
  minAvgViews: number;
  minStars: number;
}

const DEFAULT_SMART_FILTERS: SmartFilters = {
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

function formatStarsVotes(ch: Channel): string {
  const starsRaw = Number(ch.rating_avg);
  const votesRaw = Number(ch.rating_count);
  const stars = Number.isFinite(starsRaw) ? starsRaw : 0;
  const votes = Number.isFinite(votesRaw) && votesRaw > 0 ? Math.floor(votesRaw) : 0;
  const starsText = stars % 1 === 0 ? String(stars) : stars.toFixed(1).replace(/\.0$/, '');
  return `⭐ ${starsText}(${votes})`;
}

export function CampaignCreate({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (campaignId: number) => void;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [knownChannelsById, setKnownChannelsById] = useState<Record<number, Channel>>({});
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);
  const [smartFilters, setSmartFilters] = useState<SmartFilters>(DEFAULT_SMART_FILTERS);
  const [draftSmartFilters, setDraftSmartFilters] = useState<SmartFilters>(DEFAULT_SMART_FILTERS);
  const [showSmartFilter, setShowSmartFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [favoriteError, setFavoriteError] = useState('');
  const [updatingFavoriteId, setUpdatingFavoriteId] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [adText, setAdText] = useState('');
  const [adLink, setAdLink] = useState('');
  const [adImageUrl, setAdImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const BUTTON_PRESETS = [
    '🔗 Learn More',
    '🚀 Get Started',
    '📢 Join Channel',
    '🛒 Shop Now',
    '💬 Contact Us',
    '📱 Open App',
    '🎮 Play Now',
    '📥 Download',
  ];
  const [buttonText, setButtonText] = useState(BUTTON_PRESETS[0]);
  const [customButton, setCustomButton] = useState(false);
  const [customButtonText, setCustomButtonText] = useState('');

  const loadChannels = async (filters: SmartFilters, nextPage: number) => {
    if (initialLoaded) {
      setListLoading(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const res = await searchChannels({
        category: filters.category === 'all' || filters.category === 'favorites' ? undefined : filters.category,
        minSubscribers: filters.minSubscribers,
        minAvgViews: filters.minAvgViews,
        minStars: filters.minStars,
        favoriteOnly: filters.category === 'favorites',
        page: nextPage,
        limit: 2,
      });
      setChannels(res.items);
      setTotalPages(res.total_pages);
      setTotalItems(res.total);
      setPage(res.page);
      setKnownChannelsById((prev) => {
        const merged = { ...prev };
        for (const ch of res.items) merged[ch.id] = ch;
        return merged;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (initialLoaded) {
        setListLoading(false);
      } else {
        setLoading(false);
        setInitialLoaded(true);
      }
    }
  };

  useEffect(() => {
    void loadChannels(DEFAULT_SMART_FILTERS, 1);
  }, []);

  const normalizeLink = (raw: string): string => {
    const trimmed = raw.trim();
    if (/^@[a-zA-Z0-9_]{3,}$/.test(trimmed)) {
      return `https://t.me/${trimmed.slice(1)}`;
    }
    if (/^t\.me\/[a-zA-Z0-9_]{3,}$/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  const isValidLink = (raw: string): boolean => {
    const trimmed = raw.trim();
    if (!trimmed) return false;
    if (/^@[a-zA-Z0-9_]{3,}$/.test(trimmed)) return true;
    if (/^t\.me\/[a-zA-Z0-9_]{3,}$/i.test(trimmed)) return true;
    try { new URL(trimmed); return true; } catch { return false; }
  };

  const canSubmit = useMemo(() => {
    const customOk = !customButton || (customButtonText.trim().length >= 2 && customButtonText.trim().length <= 24);
    return adText.trim().length > 0 && isValidLink(adLink) && customOk && selectedChannelIds.length > 0 && !submitting;
  }, [adText, adLink, customButton, customButtonText, selectedChannelIds, submitting]);

  const selectedChannels = useMemo(
    () => selectedChannelIds
      .map((id) => knownChannelsById[id])
      .filter((ch): ch is Channel => Boolean(ch)),
    [selectedChannelIds, knownChannelsById],
  );

  const activeFilterCount = Number(smartFilters.category !== 'all')
    + Number(smartFilters.minSubscribers > 0)
    + Number(smartFilters.minAvgViews > 0)
    + Number(smartFilters.minStars > 0);

  const availableChannels = useMemo(
    () => channels.filter((ch) => {
      if (selectedChannelIds.includes(ch.id)) return false;
      if (smartFilters.category !== 'all' && smartFilters.category !== 'favorites' && ch.category !== smartFilters.category) return false;
      if (smartFilters.category === 'favorites' && !ch.is_favorite) return false;
      if (smartFilters.minSubscribers > 0 && Number(ch.subscribers) < smartFilters.minSubscribers) return false;
      if (smartFilters.minAvgViews > 0 && Number(ch.avg_post_views ?? 0) < smartFilters.minAvgViews) return false;
      if (smartFilters.minStars > 0 && Number(ch.rating_avg ?? 0) < smartFilters.minStars) return false;
      return true;
    }),
    [channels, selectedChannelIds, smartFilters],
  );

  const toggleChannel = (channelId: number) => {
    setSelectedChannelIds((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId],
    );
  };

  const handleFavoriteToggle = async (channelId: number, isFavorite: boolean) => {
    if (updatingFavoriteId === channelId) return;
    setUpdatingFavoriteId(channelId);
    setFavoriteError('');

    setChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, is_favorite: !isFavorite } : ch)));
    setKnownChannelsById((prev) => (
      prev[channelId] ? { ...prev, [channelId]: { ...prev[channelId], is_favorite: !isFavorite } } : prev
    ));
    try {
      if (isFavorite) {
        await unfavoriteChannel(channelId);
      } else {
        await favoriteChannel(channelId);
      }
    } catch (e) {
      setChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, is_favorite: isFavorite } : ch)));
      setKnownChannelsById((prev) => (
        prev[channelId] ? { ...prev, [channelId]: { ...prev[channelId], is_favorite: isFavorite } } : prev
      ));
      setFavoriteError((e as Error).message);
    } finally {
      setUpdatingFavoriteId(null);
    }
  };

  const handleImageSelect = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return; }
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    setError('');
    try {
      const url = await uploadImage(file);
      setAdImageUrl(url);
    } catch (e) {
      setError((e as Error).message);
      setImagePreview(null);
      setAdImageUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setAdImageUrl(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCreate = async () => {
    if (!canSubmit) return;
    if (!adLink.trim()) {
      setError('A link is required for your ad');
      return;
    }
    if (!isValidLink(adLink)) {
      setError('Enter a valid URL or Telegram @username');
      return;
    }
    if (customButton && (customButtonText.trim().length < 2 || customButtonText.trim().length > 24)) {
      setError('Button text must be 2–24 characters');
      return;
    }
    const finalButtonText = customButton ? customButtonText.trim() : buttonText;
    setSubmitting(true);
    setError('');
    try {
      const created = await createCampaign({
        title: title.trim() || null,
        ad_text: adText.trim(),
        ad_image_url: adImageUrl,
        ad_link: normalizeLink(adLink),
        button_text: finalButtonText,
        channel_ids: selectedChannelIds,
      });
      onCreated(created.campaign.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const openSmartFilter = () => {
    setDraftSmartFilters(smartFilters);
    setShowSmartFilter(true);
  };

  const applySmartFilter = () => {
    const normalized: SmartFilters = {
      category: draftSmartFilters.category,
      minSubscribers: clampNonNegative(Math.floor(Number(draftSmartFilters.minSubscribers))),
      minAvgViews: clampNonNegative(Math.floor(Number(draftSmartFilters.minAvgViews))),
      minStars: clampStars(Number(draftSmartFilters.minStars)),
    };
    setSmartFilters(normalized);
    void loadChannels(normalized, 1);
    setShowSmartFilter(false);
  };

  const resetSmartFilter = () => {
    setDraftSmartFilters(DEFAULT_SMART_FILTERS);
    setSmartFilters(DEFAULT_SMART_FILTERS);
    void loadChannels(DEFAULT_SMART_FILTERS, 1);
  };

  const goPrevPage = () => {
    if (page <= 1) return;
    void loadChannels(smartFilters, page - 1);
  };

  const goNextPage = () => {
    if (page >= totalPages) return;
    void loadChannels(smartFilters, page + 1);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="page-header">
        <div className="page-title">New Campaign (Multi-Channel)</div>
        <div className="page-subtitle">One creative, multiple channels</div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="form">
        <Text type="caption1" color="secondary" className="form-label-tg">Campaign Title (optional)</Text>
        <input
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Summer launch"
          maxLength={200}
        />

        <Text type="caption1" color="secondary" className="form-label-tg">Ad Text</Text>
        <textarea
          className="form-textarea"
          value={adText}
          onChange={(e) => setAdText(e.target.value)}
          placeholder="Write your ad copy..."
          maxLength={4096}
        />

        <Text type="caption1" color="secondary" className="form-label-tg">Link (required)</Text>
        <input
          className="form-input"
          value={adLink}
          onChange={(e) => setAdLink(e.target.value)}
          placeholder="https://example.com or @username"
        />
        <Text type="caption2" color="tertiary" className="form-hint">
          Enter a URL or Telegram @username. Clicks are tracked.
        </Text>

        <Text type="caption1" color="secondary" className="form-label-tg">Button Label</Text>
        <select
          className="form-select"
          value={customButton ? '__custom__' : buttonText}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setCustomButton(true);
            } else {
              setCustomButton(false);
              setButtonText(e.target.value);
            }
          }}
        >
          {BUTTON_PRESETS.map((preset) => (
            <option key={preset} value={preset}>{preset}</option>
          ))}
          <option value="__custom__">✏️ Custom...</option>
        </select>
        {customButton && (
          <div style={{ marginTop: 8 }}>
            <input
              className="form-input"
              value={customButtonText}
              type="text"
              placeholder="e.g. Visit Us"
              maxLength={24}
              onChange={(e) => setCustomButtonText(e.target.value)}
            />
            <Text type="caption2" color="tertiary" align="right" className="form-hint">
              {customButtonText.length} / 24
            </Text>
          </div>
        )}

        <Text type="caption1" color="secondary" className="form-label-tg">Ad Image (optional)</Text>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleImageSelect(e.target.files?.[0] ?? null)}
          style={{ display: 'none' }}
        />
        {imagePreview ? (
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 12 }} />
            {uploading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', borderRadius: 12, color: 'white', fontSize: 14, fontWeight: 600 }}>
                Uploading...
              </div>
            )}
            <button onClick={removeImage} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        ) : (
          <div className="img-upload-zone" onClick={() => fileRef.current?.click()}>
            <div className="img-upload-icon">🖼️</div>
            <Text type="caption1" color="secondary">Tap to upload an image</Text>
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <Text type="caption1" color="secondary" className="form-label-tg">Select Channels</Text>
        {favoriteError && <Text color="danger" type="caption2">{favoriteError}</Text>}
        <div className="catalog-toolbar">
          <label className="catalog-toolbar-label">Available</label>
          <button type="button" className="catalog-pro-filter-btn" onClick={openSmartFilter}>
            <span className="catalog-pro-filter-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 4.5a6.5 6.5 0 1 0 4.03 11.6l4.44 4.44a1 1 0 0 0 1.42-1.42l-4.44-4.44A6.5 6.5 0 0 0 11 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Smart Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>

        <div className="campaign-channel-list">
          {availableChannels.length === 0 ? (
            <div>
              <Text type="caption2" color="tertiary">
                {channels.length === 0 ? 'No channels listed yet.' : 'No channels match your current filters.'}
              </Text>
              {activeFilterCount > 0 && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="catalog-empty-reset-btn" onClick={resetSmartFilter}>Clear filters</button>
                </div>
              )}
            </div>
          ) : (
            availableChannels.map((ch) => (
              <div key={ch.id} className="campaign-channel-row">
                <button
                  type="button"
                  className="campaign-channel-btn"
                  onClick={() => toggleChannel(ch.id)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={`https://t.me/${ch.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: 'var(--tg-link)', textDecoration: 'none', fontWeight: 700 }}
                    >
                      @{ch.username}
                    </a>
                    <span style={{ color: 'var(--tg-hint)', fontSize: 11, fontWeight: 700 }}>
                      {formatStarsVotes(ch)}
                    </span>
                  </span>
                  <span>{ch.price} TON</span>
                </button>
                <button
                  type="button"
                  className="campaign-favorite-toggle"
                  onClick={() => { void handleFavoriteToggle(ch.id, Boolean(ch.is_favorite)); }}
                  disabled={updatingFavoriteId === ch.id}
                  aria-label={ch.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {ch.is_favorite ? '★' : '☆'}
                </button>
              </div>
            ))
          )}
        </div>
        {totalItems > 2 && (
          <div className="campaign-pagination">
            <button type="button" className="campaign-page-btn" onClick={goPrevPage} disabled={listLoading || page <= 1}>
              Prev
            </button>
            <Text type="caption2" color="tertiary">Page {page} / {totalPages}</Text>
            <button type="button" className="campaign-page-btn" onClick={goNextPage} disabled={listLoading || page >= totalPages}>
              Next
            </button>
          </div>
        )}
        {listLoading && (
          <Text type="caption2" color="tertiary" style={{ marginTop: 8 }}>
            Loading channels...
          </Text>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <Text type="caption1" color="secondary" className="form-label-tg">
          Selected Channels ({selectedChannels.length})
        </Text>
        <div className="campaign-channel-list">
          {selectedChannels.length === 0 ? (
            <Text type="caption2" color="tertiary">No channels selected yet.</Text>
          ) : (
            selectedChannels.map((ch) => (
              <div key={ch.id} className="campaign-selected-item">
                <div>
                  <a
                    href={`https://t.me/${ch.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--tg-link)', textDecoration: 'none' }}
                  >
                    @{ch.username}
                  </a>
                  <div style={{ fontSize: 11, color: 'var(--tg-hint)' }}>
                    {formatStarsVotes(ch)} · {ch.category} · {ch.price} TON
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className="campaign-favorite-toggle"
                    onClick={() => { void handleFavoriteToggle(ch.id, Boolean(ch.is_favorite)); }}
                    disabled={updatingFavoriteId === ch.id}
                    aria-label={ch.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {ch.is_favorite ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    className="campaign-remove-btn"
                    onClick={() => toggleChannel(ch.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Button
          text={submitting ? 'Creating...' : `Create Campaign (${selectedChannelIds.length})`}
          type="primary"
          onClick={handleCreate}
          disabled={!canSubmit}
          loading={submitting}
        />
      </div>

      {showSmartFilter && (
        <div className="pro-filter-overlay" role="dialog" aria-modal="true" aria-label="Smart filter modal">
          <div className="pro-filter-backdrop" onClick={() => setShowSmartFilter(false)} />
          <div className="pro-filter-modal">
            <div className="pro-filter-title">Smart Filter</div>
            <div className="pro-filter-subtitle">Find channels faster</div>

            <div className="pro-filter-field">
              <label htmlFor="campaign-filter-category" className="pro-filter-label">Category</label>
              <select
                id="campaign-filter-category"
                className="pro-filter-input"
                value={draftSmartFilters.category}
                onChange={(e) => setDraftSmartFilters((prev) => ({ ...prev, category: e.target.value as CategoryFilter }))}
              >
                <option value="all">All categories</option>
                <option value="favorites">❤️ Favorites</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{`${CAT_ICONS[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`}</option>
                ))}
              </select>
            </div>

            <div className="pro-filter-field">
              <label htmlFor="campaign-filter-subs" className="pro-filter-label">Min subscribers</label>
              <input
                id="campaign-filter-subs"
                className="pro-filter-input"
                type="number"
                min="0"
                step="1"
                value={draftSmartFilters.minSubscribers === 0 ? '' : draftSmartFilters.minSubscribers}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraftSmartFilters((prev) => ({ ...prev, minSubscribers: raw === '' ? 0 : Number(raw) }));
                }}
                placeholder="e.g. 10000"
              />
            </div>

            <div className="pro-filter-field">
              <label htmlFor="campaign-filter-views" className="pro-filter-label">Min avg views</label>
              <input
                id="campaign-filter-views"
                className="pro-filter-input"
                type="number"
                min="0"
                step="1"
                value={draftSmartFilters.minAvgViews === 0 ? '' : draftSmartFilters.minAvgViews}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraftSmartFilters((prev) => ({ ...prev, minAvgViews: raw === '' ? 0 : Number(raw) }));
                }}
                placeholder="e.g. 100"
              />
            </div>

            <div className="pro-filter-field">
              <label htmlFor="campaign-filter-stars" className="pro-filter-label">Min stars (0 - 5)</label>
              <select
                id="campaign-filter-stars"
                className="pro-filter-input"
                value={draftSmartFilters.minStars}
                onChange={(e) => setDraftSmartFilters((prev) => ({ ...prev, minStars: Number(e.target.value) }))}
              >
                {STAR_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? 'Any rating' : `${value.toFixed(1)}+`}
                  </option>
                ))}
              </select>
            </div>

            <div className="pro-filter-actions">
              <button type="button" className="pro-filter-btn ghost" onClick={resetSmartFilter}>Reset</button>
              <button type="button" className="pro-filter-btn ghost" onClick={() => setShowSmartFilter(false)}>Cancel</button>
              <button type="button" className="pro-filter-btn primary" onClick={applySmartFilter}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
