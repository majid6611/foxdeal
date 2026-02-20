import { useState, useEffect, useMemo } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { Catalog } from './pages/Catalog';
import { ChannelDetail } from './pages/ChannelDetail';
import { DealDetail } from './pages/DealDetail';
import { MyDeals } from './pages/MyDeals';
import { ListChannel } from './pages/ListChannel';
import { MyChannel } from './pages/MyChannel';
import { Earnings } from './pages/Earnings';
import { CampaignList } from './pages/CampaignList';
import { CampaignCreate } from './pages/CampaignCreate';
import { CampaignDetail } from './pages/CampaignDetail';
import type { Channel } from './api';

type Page =
  | { name: 'catalog' }
  | { name: 'channel'; channel: Channel }
  | { name: 'deal'; dealId: number; isOwner: boolean; campaignId?: number }
  | { name: 'my-deals' }
  | { name: 'campaigns' }
  | { name: 'campaign-create' }
  | { name: 'campaign-detail'; campaignId: number }
  | { name: 'incoming' }
  | { name: 'list-channel' }
  | { name: 'my-channels' }
  | { name: 'earnings' };

export function App() {
  const [page, setPage] = useState<Page>({ name: 'catalog' });
  const [role, setRole] = useState<'advertiser' | 'owner'>('advertiser');
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [tonNetwork, setTonNetwork] = useState<string>('');

  // Convert raw wallet address to user-friendly format (e.g. UQ... or EQ...)
  const friendlyAddress = useMemo(() => {
    if (!wallet) return '';
    try {
      const addr = Address.parseRaw(wallet.account.address);
      return addr.toString({ bounceable: false, testOnly: tonNetwork === 'testnet' });
    } catch {
      return wallet.account.address.slice(0, 6) + '...' + wallet.account.address.slice(-4);
    }
  }, [wallet, tonNetwork]);

  const tg = window.Telegram?.WebApp;

  // Handle startapp deep link for click tracking (e.g. startapp=click_33)
  const [isClickRedirect, setIsClickRedirect] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [redirectFailed, setRedirectFailed] = useState(false);

  useEffect(() => {
    tg?.ready();
    tg?.expand();

    // Check if this is a click redirect deep link
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith('click_')) {
      setIsClickRedirect(true);
      const dealId = startParam.replace('click_', '');
      const userId = tg?.initDataUnsafe?.user?.id;

      // Track the click, then open the destination URL
      fetch(`/api/track-click/${dealId}${userId ? `?uid=${userId}` : ''}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.url) {
            tg?.close();
            return;
          }

          const url = data.url as string;
          setRedirectUrl(url);
          const isTgLink = url.includes('t.me/') || url.includes('telegram.me/');

          // Strategy 1: openTelegramLink (works on desktop & iOS, closes Mini App)
          try {
            if (isTgLink && tg?.openTelegramLink) {
              tg.openTelegramLink(url);
            } else if (tg?.openLink) {
              tg.openLink(url);
            }
          } catch {
            // Will fall through to Strategy 2
          }

          // Strategy 2: After a short delay, navigate the webview directly.
          // On Android, openTelegramLink doesn't work from startapp context,
          // but window.location.href to a t.me URL works — Telegram intercepts it.
          // Do NOT call tg.close() as it cancels the navigation on Android.
          setTimeout(() => {
            window.location.href = url;
          }, 600);

          // Strategy 3: If all else fails after 3s, show manual button
          setTimeout(() => setRedirectFailed(true), 3000);
        })
        .catch(() => {
          tg?.close();
        });
      return; // Skip normal initialization
    }

    // Detect light/dark theme and set a CSS class on <html>
    const colorScheme = tg?.colorScheme || 'dark';
    document.documentElement.setAttribute('data-theme', colorScheme);

    // Fetch TON network config
    fetch('/api/config').then(r => r.json()).then(d => setTonNetwork(d.tonNetwork ?? '')).catch(() => {});

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
              setPage(
                page.isOwner
                  ? { name: 'incoming' }
                  : page.campaignId
                    ? { name: 'campaign-detail', campaignId: page.campaignId }
                    : { name: 'my-deals' },
              )
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
      case 'campaigns':
        return (
          <CampaignList
            onCreate={() => setPage({ name: 'campaign-create' })}
            onOpen={(campaignId) => setPage({ name: 'campaign-detail', campaignId })}
          />
        );
      case 'campaign-create':
        return (
          <CampaignCreate
            onBack={() => setPage({ name: 'campaigns' })}
            onCreated={(campaignId) => setPage({ name: 'campaign-detail', campaignId })}
          />
        );
      case 'campaign-detail':
        return (
          <CampaignDetail
            campaignId={page.campaignId}
            onBack={() => setPage({ name: 'campaigns' })}
            onOpenDeal={(dealId) => setPage({ name: 'deal', dealId, isOwner: false, campaignId: page.campaignId })}
            onDeleted={() => setPage({ name: 'campaigns' })}
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
      case 'earnings':
        return <Earnings connectedWallet={friendlyAddress || null} />;
    }
  };

  // If this is a click redirect, show loading or manual open button
  if (isClickRedirect) {
    return (
      <div className="click-redirect">
        {redirectFailed && redirectUrl ? (
          <>
            <div className="click-redirect-text">Tap to continue</div>
            <a
              href={redirectUrl}
              className="click-redirect-btn"
              onClick={() => setTimeout(() => tg?.close(), 300)}
            >
              {redirectUrl.includes('t.me/')
                ? `Open @${redirectUrl.split('t.me/')[1]?.split(/[?/#]/)[0] || 'link'}`
                : 'Open Link'}
            </a>
            <button className="click-redirect-close" onClick={() => tg?.close()}>
              Close
            </button>
          </>
        ) : (
          <>
            <div className="click-redirect-spinner" />
            <div className="click-redirect-text">Opening link...</div>
          </>
        )}
      </div>
    );
  }

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="Fox Deal" className="brand-logo-img" />
            <div className="brand-text">
              <div className="brand-name">Fox Deal</div>
              {user && <div className="brand-greeting">Hi, {user.first_name}</div>}
            </div>
          </div>

          {/* Wallet button — top right */}
          <div className="wallet-area">
            {wallet ? (
              <div style={{ position: 'relative' }}>
                <button
                  className="wallet-btn wallet-connected"
                  onClick={() => setShowWalletMenu(!showWalletMenu)}
                >
                  <span className="wallet-dot" />
                  {friendlyAddress.slice(0, 4)}...{friendlyAddress.slice(-4)}
                  {tonNetwork === 'testnet' && <span className="wallet-testnet-badge">TEST</span>}
                </button>
                {showWalletMenu && (
                  <>
                    <div className="wallet-overlay" onClick={() => setShowWalletMenu(false)} />
                    <div className="wallet-menu">
                      <div className="wallet-menu-addr">
                        {friendlyAddress}
                      </div>
                      <button
                        className="wallet-menu-disconnect"
                        onClick={() => {
                          tonConnectUI.disconnect();
                          setShowWalletMenu(false);
                        }}
                      >
                        Disconnect Wallet
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                className="wallet-btn"
                onClick={() => tonConnectUI.openModal()}
              >
                Connect Wallet
                {tonNetwork === 'testnet' && <span className="wallet-testnet-badge">TEST</span>}
              </button>
            )}
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
            className={`nav-btn ${page.name === 'campaigns' || page.name === 'campaign-create' || page.name === 'campaign-detail' ? 'active' : ''}`}
            onClick={() => setPage({ name: 'campaigns' })}
          >
            Campaigns
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
            Channels
          </button>
          <button
            className={`nav-btn ${page.name === 'earnings' ? 'active' : ''}`}
            onClick={() => setPage({ name: 'earnings' })}
          >
            Earnings
          </button>
        </div>
      )}

      {renderPage()}
    </div>
    </>
  );
}
