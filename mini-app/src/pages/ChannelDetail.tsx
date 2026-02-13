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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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

    // Show local preview immediately
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

    setSubmitting(true);
    setError('');

    try {
      const deal = await createDeal({
        channelId: channel.id,
        adText: adText.trim(),
        adImageUrl: imageUrl,
      });
      onDealCreated(deal.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back to catalog</button>

      <div className="detail-header">
        <div className="detail-title">@{channel.username}</div>
        <div className="card-subtitle">{channel.category}</div>
        <div className="detail-price">{channel.price} Stars</div>
      </div>

      <div className="detail-section">
        <div className="detail-row">
          <span>Subscribers</span>
          <strong>{channel.subscribers.toLocaleString()}</strong>
        </div>
        <div className="detail-row">
          <span>Ad Duration</span>
          <strong>{channel.duration_hours}h</strong>
        </div>
      </div>

      <div className="separator" />

      <h2 className="section-title" style={{ marginBottom: 14 }}>Place an Ad</h2>

      {error && <div className="error">{error}</div>}

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

      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={submitting || uploading || !adText.trim()}
      >
        {submitting ? 'Submitting...' : `Submit Deal · ${channel.price} Stars`}
      </button>
    </div>
  );
}
