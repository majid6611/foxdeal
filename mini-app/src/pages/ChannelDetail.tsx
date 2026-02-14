import { useState, useRef } from 'react';
import { createDeal, uploadImage, type Channel } from '../api';

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

  // CPC state
  const [pricingModel, setPricingModel] = useState<'time' | 'cpc'>('time');
  const [budget, setBudget] = useState('');

  const hasCpc = channel.cpc_price > 0;
  const estimatedClicks = pricingModel === 'cpc' && budget && channel.cpc_price > 0
    ? Math.floor(Number(budget) / channel.cpc_price)
    : 0;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

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

  const handleSubmit = async () => {
    if (!adText.trim()) {
      setError('Please write your ad copy');
      return;
    }

    if (pricingModel === 'cpc') {
      if (!adLink.trim()) {
        setError('CPC ads require a link for the inline button');
        return;
      }
      if (!budget || Number(budget) < channel.cpc_price) {
        setError(`Budget must be at least ${channel.cpc_price} Stars (1 click)`);
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
        adLink: adLink.trim() || null,
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
    ? (budget ? `${budget} Stars` : '...')
    : `${channel.price} Stars`;

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back to catalog</button>

      <div className="detail-header">
        <div className="detail-title">@{channel.username}</div>
        <div className="card-subtitle">{channel.category}</div>
      </div>

      <div className="detail-section">
        <div className="detail-row">
          <span>Subscribers</span>
          <strong>{channel.subscribers.toLocaleString()}</strong>
        </div>
        <div className="detail-row">
          <span>Time-based Price</span>
          <strong>{channel.price} Stars / {channel.duration_hours}h</strong>
        </div>
        {hasCpc && (
          <div className="detail-row">
            <span>CPC Price</span>
            <strong>{channel.cpc_price} Stars / click</strong>
          </div>
        )}
      </div>

      <div className="separator" />

      <h2 className="section-title" style={{ marginBottom: 14 }}>Place an Ad</h2>

      {error && <div className="error">{error}</div>}

      {/* Pricing model selector */}
      {hasCpc && (
        <div className="form-group">
          <label className="form-label">Pricing Model</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn ${pricingModel === 'time' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '10px 0' }}
              onClick={() => setPricingModel('time')}
              type="button"
            >
              Time-based
            </button>
            <button
              className={`btn ${pricingModel === 'cpc' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '10px 0' }}
              onClick={() => setPricingModel('cpc')}
              type="button"
            >
              Cost per Click
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--tg-hint)', marginTop: 6 }}>
            {pricingModel === 'time'
              ? `Pay ${channel.price} Stars for ${channel.duration_hours}h of ad placement`
              : `Pay ${channel.cpc_price} Stars per click. Set your total budget below.`}
          </div>
        </div>
      )}

      {/* CPC budget input */}
      {pricingModel === 'cpc' && (
        <div className="form-group">
          <label className="form-label">Total Budget (Stars)</label>
          <input
            className="form-input"
            type="number"
            min={Math.max(1, Math.ceil(channel.cpc_price))}
            step="1"
            placeholder={`Min ${Math.max(1, Math.ceil(channel.cpc_price))} Stars`}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          {estimatedClicks > 0 && (
            <div style={{ fontSize: 12, color: 'var(--fox-amber)', marginTop: 4 }}>
              ≈ {estimatedClicks} clicks at {channel.cpc_price} Stars/click
            </div>
          )}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Ad Image (optional)</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />

        {imagePreview ? (
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <img
              src={imagePreview}
              alt="Ad preview"
              style={{
                width: '100%',
                maxHeight: 200,
                objectFit: 'cover',
                borderRadius: 8,
              }}
            />
            {uploading && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.5)', borderRadius: 8, color: 'white',
              }}>
                Uploading...
              </div>
            )}
            <button
              onClick={removeImage}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.6)', color: 'white',
                border: 'none', borderRadius: '50%', width: 28, height: 28,
                cursor: 'pointer', fontSize: 14, lineHeight: '28px',
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            + Add Image
          </button>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Ad Copy</label>
        <textarea
          className="form-textarea"
          placeholder="Write your ad text here..."
          value={adText}
          onChange={(e) => setAdText(e.target.value)}
          maxLength={4096}
        />
        <div style={{ fontSize: 12, color: 'var(--tg-hint)', marginTop: 4, textAlign: 'right' }}>
          {adText.length}/4096
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">
          Link {pricingModel === 'cpc' ? '(required for CPC)' : '(optional)'}
        </label>
        <input
          className="form-input"
          type="url"
          placeholder="https://example.com"
          value={adLink}
          onChange={(e) => setAdLink(e.target.value)}
        />
        <div style={{ fontSize: 12, color: 'var(--tg-hint)', marginTop: 4 }}>
          {pricingModel === 'cpc'
            ? 'Each click on the inline button costs ' + channel.cpc_price + ' Stars from your budget.'
            : 'A "Learn More" button will appear on the post. Clicks are tracked.'}
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={submitting || uploading || !adText.trim() || (pricingModel === 'cpc' && !budget)}
      >
        {submitting ? 'Submitting...' : `Submit Deal · ${displayPrice}`}
      </button>
    </div>
  );
}
