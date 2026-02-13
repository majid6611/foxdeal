import { useState, useEffect } from 'react';
import { Catalog } from './pages/Catalog';
import { ChannelDetail } from './pages/ChannelDetail';
import { DealDetail } from './pages/DealDetail';
import { MyDeals } from './pages/MyDeals';
import { ListChannel } from './pages/ListChannel';
import { MyChannel } from './pages/MyChannel';
import type { Channel } from './api';
import './styles.css';

type Page =
  | { name: 'catalog' }
  | { name: 'channel'; channel: Channel }
  | { name: 'deal'; dealId: number; isOwner: boolean }
  | { name: 'my-deals' }
  | { name: 'incoming' }
  | { name: 'list-channel' }
  | { name: 'my-channels' };

export function App() {
  const [page, setPage] = useState<Page>({ name: 'catalog' });
  const [role, setRole] = useState<'advertiser' | 'owner'>('advertiser');
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  const tg = window.Telegram?.WebApp;

  useEffect(() => {
    tg?.ready();
    tg?.expand();

    // Show splash for 2 seconds, then fade out over 0.5s
    const fadeTimer = setTimeout(() => setSplashFading(true), 2000);
    const hideTimer = setTimeout(() => setSplashVisible(false), 2500);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  const user = tg?.initDataUnsafe?.user;

  const renderPage = () => {
    switch (page.name) {
      case 'catalog':
        return (
          <Catalog
            onSelect={(ch) => setPage({ name: 'channel', channel: ch })}
          />
        );
      case 'channel':
        return (
          <ChannelDetail
            channel={page.channel}
            onBack={() => setPage({ name: 'catalog' })}
            onDealCreated={(dealId) =>
              setPage({ name: 'deal', dealId, isOwner: false })
            }
          />
        );
      case 'deal':
        return (
          <DealDetail
            dealId={page.dealId}
            isOwner={page.isOwner}
            onBack={() =>
              setPage(page.isOwner ? { name: 'incoming' } : { name: 'my-deals' })
            }
          />
        );
      case 'my-deals':
        return (
          <MyDeals
            isOwner={false}
            onSelectDeal={(dealId) =>
              setPage({ name: 'deal', dealId, isOwner: false })
            }
          />
        );
      case 'incoming':
        return (
          <MyDeals
            isOwner={true}
            onSelectDeal={(dealId) =>
              setPage({ name: 'deal', dealId, isOwner: true })
            }
          />
        );
      case 'list-channel':
        return (
          <ListChannel
            onBack={() => setPage({ name: 'my-channels' })}
            onCreated={() => setPage({ name: 'my-channels' })}
          />
        );
      case 'my-channels':
        return (
          <MyChannel
            onBack={() => setPage({ name: 'incoming' })}
          />
        );
    }
  };

  return (
    <>
      {splashVisible && (
        <div className={`splash ${splashFading ? 'fade-out' : ''}`}>
          <div className="splash-bg-glow splash-bg-glow-left" />
          <div className="splash-bg-glow splash-bg-glow-right" />
          <div className="splash-orbit splash-orbit-1" />
          <div className="splash-orbit splash-orbit-2" />
          <div className="splash-logo-wrap">
            <img src="/logo.png" alt="Fox Deal" className="splash-logo" />
          </div>
          <div className="splash-title">Fox Deal</div>
          <div className="splash-subtitle">Smart Telegram Ad Marketplace</div>
          <div className="splash-loading-bar">
            <div className="splash-loading-progress" />
          </div>
          <div className="splash-spinner" />
        </div>
      )}

      <div className="app">
        <div className="brand">
          <img src="/logo.png" alt="Fox Deal" className="brand-logo-img" />
          <div className="brand-text">
            <div className="brand-name">Fox Deal</div>
            {user && <div className="brand-greeting">Hi, {user.first_name}</div>}
          </div>
        </div>

      {/* Role toggle */}
      <div className="nav">
        <button
          className={`nav-btn ${role === 'advertiser' ? 'active' : ''}`}
          onClick={() => {
            setRole('advertiser');
            setPage({ name: 'catalog' });
          }}
        >
          Advertiser
        </button>
        <button
          className={`nav-btn ${role === 'owner' ? 'active' : ''}`}
          onClick={() => {
            setRole('owner');
            setPage({ name: 'incoming' });
          }}
        >
          Channel Owner
        </button>
      </div>

      {/* Sub-navigation */}
      {role === 'advertiser' && (
        <div className="nav">
          <button
            className={`nav-btn ${page.name === 'catalog' || page.name === 'channel' ? 'active' : ''}`}
            onClick={() => setPage({ name: 'catalog' })}
          >
            Catalog
          </button>
          <button
            className={`nav-btn ${page.name === 'my-deals' || (page.name === 'deal' && !page.isOwner) ? 'active' : ''}`}
            onClick={() => setPage({ name: 'my-deals' })}
          >
            My Deals
          </button>
        </div>
      )}

      {role === 'owner' && (
        <div className="nav">
          <button
            className={`nav-btn ${page.name === 'incoming' || (page.name === 'deal' && page.isOwner) ? 'active' : ''}`}
            onClick={() => setPage({ name: 'incoming' })}
          >
            Deals
          </button>
          <button
            className={`nav-btn ${page.name === 'my-channels' || page.name === 'list-channel' ? 'active' : ''}`}
            onClick={() => setPage({ name: 'my-channels' })}
          >
            My Channels
          </button>
        </div>
      )}

      {renderPage()}
    </div>
    </>
  );
}
