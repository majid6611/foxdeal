import { useEffect, useState } from 'react';
import { getCampaigns, type CampaignListItem } from '../api';
import { Text, Spinner, Button } from '@telegram-tools/ui-kit';

export function CampaignList({
  onCreate,
  onOpen,
}: {
  onCreate: () => void;
  onOpen: (campaignId: number) => void;
}) {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getCampaigns()
      .then(setCampaigns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="32px" /></div>;
  if (error) return <Text color="danger">{error}</Text>;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Multi-Channel Campaigns</div>
        <div className="page-subtitle">Create once, run across many channels</div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Button text="New Campaign (Multi-Channel)" type="primary" onClick={onCreate} />
      </div>

      {campaigns.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📣</div>
          <Text type="body" color="secondary">No campaigns yet.</Text>
          <Text type="caption1" color="tertiary">Create your first multi-channel campaign.</Text>
        </div>
      ) : (
        campaigns.map((campaign) => (
          <div key={campaign.id} className="ch-card" onClick={() => onOpen(campaign.id)}>
            <div className="ch-avatar">C{campaign.id}</div>
            <div className="ch-card-body">
              <div className="ch-card-top">
                <span className="ch-card-name">{campaign.title?.trim() || `Campaign #${campaign.id}`}</span>
                <span className="status-pill status-pending">{campaign.items_total} items</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--tg-hint)', marginTop: 2 }}>
                {campaign.posted > 0
                  ? `Posted ${campaign.posted}`
                  : campaign.paid > 0
                    ? `Paid ${campaign.paid}`
                    : `Approved ${campaign.approved}`}
              </div>
              <div className="ch-card-meta" style={{ marginTop: 4 }}>
                {campaign.rejected > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--tg-hint)' }}>
                    Rejected {campaign.rejected}
                  </span>
                )}
                {campaign.expired > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--tg-hint)' }}>
                    Expired {campaign.expired}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--tg-hint)' }}>
                  {new Date(campaign.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <span className="ch-card-chevron">›</span>
          </div>
        ))
      )}
    </div>
  );
}
