import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Spinner, Text } from '@telegram-tools/ui-kit';
import { createCampaign, favoriteChannel, getChannels, unfavoriteChannel, uploadImage, type Channel } from '../api';

const CATEGORIES = ['news', 'tech', 'crypto', 'entertainment', 'education', 'lifestyle', 'business', 'general'] as const;
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

export function CampaignCreate({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (campaignId: number) => void;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    getChannels()
      .then((loaded) => {
        setChannels(loaded);
        if (loaded.length > 0) {
          const available = new Set(loaded.map((c) => c.category));
          const firstCategory = CATEGORIES.find((cat) => available.has(cat)) ?? '';
          setActiveCategory(firstCategory ?? '');
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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

  const categories = useMemo(
    () => {
      const available = new Set(channels.map((ch) => ch.category));
      return CATEGORIES.filter((cat) => available.has(cat));
    },
    [channels],
  );

  const selectedChannels = useMemo(
    () => channels.filter((ch) => selectedChannelIds.includes(ch.id)),
    [channels, selectedChannelIds],
  );

  const availableChannels = useMemo(
    () => channels.filter((ch) => {
      if (selectedChannelIds.includes(ch.id)) return false;
      if (activeCategory === 'favorites') return Boolean(ch.is_favorite);
      return ch.category === activeCategory;
    }),
    [channels, activeCategory, selectedChannelIds],
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
    try {
      if (isFavorite) {
        await unfavoriteChannel(channelId);
      } else {
        await favoriteChannel(channelId);
      }
    } catch (e) {
      setChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, is_favorite: isFavorite } : ch)));
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
        <div className="filter-chips">
          <button
            key="favorites"
            type="button"
            className={`filter-chip ${activeCategory === 'favorites' ? 'active' : ''}`}
            onClick={() => setActiveCategory('favorites')}
          >
            ❤️ Favorites
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`filter-chip ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {`${CAT_ICONS[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`}
            </button>
          ))}
        </div>

        <div className="campaign-channel-list">
          {availableChannels.length === 0 ? (
            <Text type="caption2" color="tertiary">
              {activeCategory === 'favorites'
                ? 'No favorite channels available.'
                : 'No more channels in this category.'}
            </Text>
          ) : (
            availableChannels.map((ch) => (
              <div key={ch.id} className="campaign-channel-row">
                <button
                  type="button"
                  className="campaign-channel-btn"
                  onClick={() => toggleChannel(ch.id)}
                >
                  <span>@{ch.username}</span>
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
                  <div style={{ fontSize: 13, fontWeight: 700 }}>@{ch.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--tg-hint)' }}>
                    {ch.category} · {ch.price} TON
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
    </div>
  );
}
