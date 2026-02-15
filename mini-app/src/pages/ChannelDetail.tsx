import { useState, useRef } from 'react';
import { createDeal, uploadImage, type Channel } from '../api';
import { Button, Text } from '@telegram-tools/ui-kit';

export function ChannelDetail({
  channel,
  onBack,
  onDealCreated,
}: {
  channel: Channel;
  onBack: () => void;
  onDealCreated: (dealId: number) => void;
}) {
  const [adText, setAdText] = useState('');
  const [adLink, setAdLink] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [pricingModel, setPricingModel] = useState<'time' | 'cpc'>('time');
  const [budget, setBudget] = useState('');

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

  const hasCpc = channel.cpc_price > 0;
  const estimatedClicks = pricingModel === 'cpc' && budget && channel.cpc_price > 0
    ? Math.floor(Number(budget) / channel.cpc_price)
    : 0;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return; }
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    setError('');
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
    } catch (e) {
      setError((e as Error).message);
      setImagePreview(null);
      setImageUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setImageUrl(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  /**
   * Normalize the link field:
   * - @username → https://t.me/username
   * - Regular URLs are kept as-is
   */
  const normalizeLink = (raw: string): string => {
    const trimmed = raw.trim();
    // Telegram @username format
    if (/^@[a-zA-Z0-9_]{3,}$/.test(trimmed)) {
      return `https://t.me/${trimmed.slice(1)}`;
    }
    return trimmed;
  };

  const isValidLink = (raw: string): boolean => {
    const trimmed = raw.trim();
    if (!trimmed) return false;
    // Accept @username (3+ chars after @)
    if (/^@[a-zA-Z0-9_]{3,}$/.test(trimmed)) return true;
    // Accept URLs
    try { new URL(trimmed); return true; } catch { return false; }
  };

  const finalButtonText = customButton ? customButtonText.trim() : buttonText;

  const handleSubmit = async () => {
    if (!adText.trim()) { setError('Please write your ad copy'); return; }
    if (!adLink.trim()) { setError('A link is required for your ad'); return; }
    if (!isValidLink(adLink)) { setError('Enter a valid URL or Telegram @username'); return; }
    if (customButton && (customButtonText.trim().length < 2 || customButtonText.trim().length > 24)) {
      setError('Button text must be 2–24 characters');
      return;
    }
    if (pricingModel === 'cpc') {
      if (!budget || Number(budget) < channel.cpc_price) {
        setError(`Budget must be at least ${channel.cpc_price} TON (1 click)`);
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      const deal = await createDeal({
        channelId: channel.id,
        adText: adText.trim(),
        adImageUrl: imageUrl,
        adLink: normalizeLink(adLink),
        buttonText: finalButtonText,
        pricingModel,
        budget: pricingModel === 'cpc' ? Number(budget) : undefined,
      });
      onDealCreated(deal.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const displayPrice = pricingModel === 'cpc'
    ? (budget ? `${budget} TON` : '—')
    : `${channel.price} TON`;

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back to catalog</button>

      {/* Hero Header */}
      <div className="hero-card">
        <div className="hero-identity">
          {channel.photo_url ? (
            <img src={channel.photo_url} alt="" className="hero-photo" />
          ) : (
            <div className="hero-avatar">{channel.username.charAt(0).toUpperCase()}</div>
          )}
          <div className="hero-info">
            <a href={`https://t.me/${channel.username}`} target="_blank" rel="noopener noreferrer" className="hero-name hero-link">@{channel.username}</a>
            <div className="hero-cat">{channel.category}</div>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-value">{channel.subscribers.toLocaleString()}</div>
            <div className="hero-stat-label">Subscribers</div>
          </div>
          {typeof channel.avg_post_views === 'number' && channel.avg_post_views > 0 && (
            <div className="hero-stat">
              <div className="hero-stat-value">{channel.avg_post_views.toLocaleString()}</div>
              <div className="hero-stat-label">Avg Views</div>
            </div>
          )}
          <div className="hero-stat">
            <div className="hero-stat-value">{channel.price}</div>
            <div className="hero-stat-label">TON / {channel.duration_hours}h</div>
          </div>
          {hasCpc && (
            <div className="hero-stat">
              <div className="hero-stat-value">{channel.cpc_price}</div>
              <div className="hero-stat-label">TON / Click</div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Pricing model selector */}
      <div className="section-divider">
        <span className="section-divider-text">Create Your Ad</span>
      </div>

      {hasCpc && (
        <>
          <Text type="caption1" color="secondary" className="form-label-tg">Pricing Model</Text>
          <div className="pricing-toggle">
            <button
              className={`pricing-toggle-btn ${pricingModel === 'time' ? 'active' : ''}`}
              onClick={() => setPricingModel('time')}
            >
              Time-based
              <span className="toggle-sub">{channel.price} TON / {channel.duration_hours}h</span>
            </button>
            <button
              className={`pricing-toggle-btn ${pricingModel === 'cpc' ? 'active' : ''}`}
              onClick={() => setPricingModel('cpc')}
            >
              Cost per Click
              <span className="toggle-sub">{channel.cpc_price} TON / click</span>
            </button>
          </div>
        </>
      )}

      {/* CPC budget */}
      {pricingModel === 'cpc' && (
        <div className="section-gap">
          <Text type="caption1" color="secondary" className="form-label-tg">Total Budget (TON)</Text>
          <input
            className="form-input"
            value={budget}
            type="number"
            min="1"
            placeholder={`Min ${Math.max(1, Math.ceil(channel.cpc_price))} TON`}
            onChange={(e) => setBudget(e.target.value)}
          />
          {estimatedClicks > 0 && (
            <Text type="caption2" color="accent" className="form-hint">
              ≈ {estimatedClicks} clicks at {channel.cpc_price} TON/click
            </Text>
          )}
        </div>
      )}

      {/* Image upload */}
      <div className="section-gap">
        <Text type="caption1" color="secondary" className="form-label-tg">Ad Image (optional)</Text>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
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

      {/* Ad copy */}
      <div className="section-gap">
        <Text type="caption1" color="secondary" className="form-label-tg">Ad Copy</Text>
        <textarea
          className="form-textarea"
          placeholder="Write your ad text here..."
          value={adText}
          onChange={(e) => setAdText(e.target.value)}
          maxLength={4096}
        />
        <Text type="caption2" color="tertiary" align="right">{adText.length} / 4096</Text>
      </div>

      {/* Link */}
      <div className="section-gap">
        <Text type="caption1" color="secondary" className="form-label-tg">
          Link (required)
        </Text>
        <input
          className="form-input"
          value={adLink}
          type="text"
          placeholder="https://example.com or @username"
          onChange={(e) => setAdLink(e.target.value)}
        />
        <Text type="caption2" color="tertiary" className="form-hint">
          Enter a URL or Telegram @username. {pricingModel === 'cpc'
            ? `Each unique click costs ${channel.cpc_price} TON from your budget.`
            : 'Clicks are tracked.'}
        </Text>
      </div>

      {/* Button label selector */}
      <div className="section-gap">
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
      </div>

      <div style={{ marginTop: 20 }}>
        <Button
          text={submitting ? 'Submitting...' : `Submit Deal · ${displayPrice}`}
          type="primary"
          onClick={handleSubmit}
          disabled={submitting || uploading || !adText.trim() || !isValidLink(adLink) || (customButton && (customButtonText.trim().length < 2 || customButtonText.trim().length > 24)) || (pricingModel === 'cpc' && !budget)}
          loading={submitting}
        />
      </div>
    </div>
  );
}
