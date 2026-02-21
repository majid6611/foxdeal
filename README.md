# Fox Deal — Telegram Ad Marketplace

Fox Deal is a Telegram Mini App marketplace where **channel owners** list their channels for advertising and **advertisers** purchase ad placements using **TON**. The platform supports both **time-based** and **cost-per-click (CPC)** pricing models with built-in escrow, automated posting, verification, and earnings tracking.

It also supports **Multi-Channel Campaigns**: an advertiser can create one creative and target multiple channels, creating one independent deal per channel under a single campaign dashboard.
Advertisers can also mark channels as **favorites** and use **Favorites filters** in both Catalog and Campaign creation.

---

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌────────────┐
│  Telegram     │────▶│  market-app       │────▶│ PostgreSQL │
│  Bot API      │◀────│  (Node + Express  │◀────│            │
│               │     │   + grammY bot)   │     └────────────┘
└──────────────┘     │  Port 3000        │
                     └────────┬─────────┘
                              │ /api proxy
                     ┌────────▼─────────┐
                     │  market-mini-app  │
                     │  (React + Vite)   │
                     │  Port 5173        │
                     └──────────────────┘
                              │
                     ┌────────▼─────────┐
                     │  Nginx (reverse   │
                     │  proxy + SSL)     │
                     │  Port 443         │
                     └──────────────────┘
```

| Service | Description |
|---------|-------------|
| **market-app** | Backend API (Express) + Telegram bot (grammY) + background jobs |
| **market-mini-app** | React Mini App served by Vite dev server |
| **PostgreSQL** | Database (external, not managed by this compose file) |
| **Nginx** | Reverse proxy with SSL termination (external, not managed by this compose file) |

---

## Prerequisites

- **Docker** and **Docker Compose** v2+
- **PostgreSQL** database (accessible from Docker network)
- **Telegram Bot** created via [@BotFather](https://t.me/BotFather)
- **Domain with SSL** pointed to your server (for Telegram Mini App)
- **Nginx** (or similar reverse proxy) configured to proxy to ports 3000/5173

---

## Quick Start

### 1. Clone the repository

```bash
git clone git@github.com:majid6611/foxdeal.git
cd foxdeal
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@postgres:5432/market

# Telegram bot token from @BotFather
BOT_TOKEN=your_bot_token_here

# Public URL of the Mini App (must be HTTPS for Telegram)
MINI_APP_URL=https://your-domain.com

# How long an ad stays posted before verification (minutes)
POST_DURATION_MINUTES=120

# How long advertiser has to pay after approval (hours)
PAYMENT_TIMEOUT_HOURS=2

# How long owner has to approve/reject a deal (hours)
APPROVAL_TIMEOUT_HOURS=24
```

### 3. Docker network setup

The app expects an external Docker network (to share with your PostgreSQL and Nginx containers). Create it if it doesn't exist:

```bash
docker network create YOUR_NETWORK_NAME
```

> **Note:** If your network has a different name, update `docker-compose.yml` under `networks`.

### 4. Build and start

```bash
docker compose up -d --build
```

This starts two containers:
- `market-app` on port **3000** (API + bot)
- `market-mini-app` on port **5173** (frontend)

### 5. Run database migrations

```bash
docker exec market-app npx tsx src/db/migrate.ts
```

This creates all required tables (`users`, `channels`, `deals`, `transactions`, `owner_earnings`, `campaigns`, `campaign_items`, `favorite_channels`) and applies any pending schema changes.

### 6. Configure Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Select your bot → **Bot Settings** → **Menu Button** → Set the Mini App URL to your domain (e.g. `https://your-domain.com`)
3. Alternatively, configure a **Web App** button via BotFather

### 7. Configure Nginx

Add a reverse proxy config for your domain. Example:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Mini App (frontend)
    location / {
        proxy_pass http://market-mini-app:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # API + uploads + click tracking
    location /api/ {
        proxy_pass http://market-app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

> **Important:** After rebuilding containers, run `nginx -s reload` to refresh DNS cache for container IPs.

Reload nginx:

```bash
docker exec nginx nginx -s reload
```

---

## Project Structure

```
fox-deal/
├── docker-compose.yml          # Docker services (app + mini-app)
├── Dockerfile                  # Backend container
├── .env.example                # Environment template
├── package.json                # Backend dependencies
├── tsconfig.json               # TypeScript config
│
├── src/                        # Backend source
│   ├── index.ts                # Entry point (starts API + bot + jobs)
│   ├── config/env.ts           # Environment validation (Zod)
│   │
│   ├── api/                    # Express API
│   │   ├── index.ts            # App setup, routes, click tracking
│   │   ├── middleware/auth.ts  # Telegram initData validation
│   │   └── routes/
│   │       ├── channels.ts     # Channel CRUD + favorites
│   │       ├── deals.ts        # Deal creation, approve/reject/cancel
│   │       ├── campaigns.ts    # Multi-channel campaigns (create/list/detail/pay-all)
│   │       ├── payments.ts     # TON payment prep + confirmation
│   │       ├── earnings.ts     # Owner earnings summary + history
│   │       └── upload.ts       # Image upload/serving
│   │
│   ├── bot/                    # Telegram bot (grammY)
│   │   ├── index.ts            # Bot setup, /start command, payment handlers
│   │   ├── admin.ts            # Channel admin checks, posting, message verification
│   │   ├── jobs.ts             # Auto-post, monitoring, CPC completion
│   │   ├── payments.ts         # Payment processing hooks
│   │   ├── withdrawAdmin.ts    # Withdraw request admin workflow
│   │   ├── notifications.ts    # DM notifications to users
│   │   ├── expiry.ts           # Deal expiry background job
│   │   └── channelCheck.ts     # Periodic bot admin verification
│   │
│   ├── db/                     # Database layer
│   │   ├── index.ts            # PostgreSQL connection pool
│   │   ├── queries.ts          # All SQL queries
│   │   ├── migrate.ts          # Migration runner
│   │   └── migrations/         # SQL migration files (001+)
│   │
│   ├── escrow/                 # Escrow state machine
│   │   ├── index.ts            # Valid transitions, guards
│   │   └── transitions.ts      # transitionDeal, hold/release/refund
│   │
│   └── shared/types.ts         # TypeScript interfaces
│
├── mini-app/                   # Frontend (React + Vite)
│   ├── Dockerfile              # Frontend container
│   ├── package.json            # Frontend dependencies
│   ├── vite.config.ts          # Vite config (proxy, allowedHosts)
│   ├── index.html              # HTML entry
│   ├── public/logo.png         # Fox Deal logo
│   └── src/
│       ├── main.tsx            # React entry
│       ├── App.tsx             # Routing, role switch, splash screen
│       ├── api.ts              # API client (typed fetch wrapper)
│       ├── styles.css          # Global styles (light/dark theme)
│       └── pages/
│           ├── Catalog.tsx     # Browse channels + favorites filter
│           ├── ChannelDetail.tsx  # Create deal (time/CPC selector)
│           ├── CampaignList.tsx   # Multi-channel campaign list
│           ├── CampaignCreate.tsx # Multi-channel campaign creation + favorites filter
│           ├── CampaignDetail.tsx # Campaign item statuses + bulk actions
│           ├── DealDetail.tsx  # Deal status, actions, CPC stats
│           ├── MyDeals.tsx     # Advertiser/owner deal list
│           ├── MyChannel.tsx   # Channel management + add form
│           ├── Earnings.tsx    # Owner earnings dashboard
│           └── ListChannel.tsx # (deprecated, merged into MyChannel)
```

---

## Deal Lifecycle

```
created → pending_approval → approved → escrow_held → posted → verified → completed
                │                │                              │
                ▼                ▼                              ▼
            rejected         cancelled                      disputed → refunded
                                                               (post deleted early)
```

1. **Advertiser** creates a deal (chooses time-based or CPC)
2. **Channel owner** approves or rejects
3. **Advertiser** pays via TON (deal payment held in escrow)
4. **Bot** auto-posts the ad to the channel
5. **Bot** monitors the post:
   - **Time-based:** checks if post stays up for the full duration → completes
   - **CPC:** tracks clicks, deducts from budget → completes when budget exhausted
6. On completion: owner/platform split is calculated by **tiered platform fee**
7. Earnings are held for **3 days** before payout eligibility
8. After completion, both sides can submit a **1–5 star rating** (advertiser rates channel, owner rates advertiser)

### Rating System

- Ratings are available only for **completed deals**.
- **Advertiser → Channel**: advertiser rates the channel (1–5 stars).
- **Channel Owner → Advertiser**: owner rates the advertiser (1–5 stars).
- Each deal can be rated only once per side.
- Channel rating aggregates are stored on the channel profile (`rating_avg`, `rating_count`).
- Advertiser rating aggregates are stored on the user profile (`advertiser_rating_avg`, `advertiser_rating_count`).
- When owners receive new deal requests, the advertiser’s current rating summary is shown in the notification.

### Tiered Platform Fee (by deal amount in TON)

| Amount | Fee % |
|--------|-------|
| `amount == 5` | `15%` |
| `5 < amount < 10` | `10%` |
| `10 ≤ amount < 25` | `7%` |
| `25 ≤ amount < 100` | `5%` |
| `100 ≤ amount < 300` | `4%` |
| `amount ≥ 300` | `3%` |

Fee breakdown is stored per earning record and used consistently in earnings totals and withdraw calculations.

### Withdraw Request Flow

1. Owner waits until earnings are eligible (`payout_at <= now`).
2. Owner submits a withdraw request from Earnings page.
3. Request is sent to admin chat with **Paid** / **Cancel** actions (with confirm step).
4. On paid confirmation, admin submits blockchain TX URL.
5. Request is marked paid, linked earnings move to paid, owner gets notification with wallet + TX link.

Rules:
- Wallet is locked while request status is `pending` or `awaiting_tx_link`.
- Minimum withdraw amount is controlled by `MIN_WITHDRAW_TON` (default `5`).

---

## Pricing Models

### Time-based
- Channel owner sets a **price** (TON) and **duration** (hours)
- Advertiser pays the full price upfront
- Ad stays posted for the duration; payment released after verification

### Cost-per-Click (CPC)
- Channel owner sets a **CPC price** (TON per click, supports decimals e.g. 0.5)
- Advertiser sets a **total budget** (TON) and must provide a link
- Each click on the inline button deducts the CPC price from the budget
- When budget is exhausted, the post is automatically removed
- Owner receives spent amount minus tiered fee; unspent budget is refunded

---

## Multi-Channel Campaigns

- Advertiser creates a campaign once with shared ad content.
- Selects multiple channels (with category-based filtering in UI).
- System creates one independent deal per selected channel.
- Each item follows the existing deal lifecycle (approval, payment, posting, verification).
- Campaign dashboard shows per-channel status, links to each deal, and aggregate metrics.
- Campaign-specific bulk actions are available (for example, **Pay All Approved**), while legacy single-deal payment endpoints remain unchanged.

## Favorite Channels

- Advertisers can mark/unmark channels as favorites from:
  - Catalog cards
  - Channel detail page
  - Campaign creation channel picker
- Catalog includes a **Favorites** filter chip to quickly show saved channels.
- Campaign creation includes a **Favorites** filter chip in the channel selector.
- Favorites are stored in `favorite_channels` and linked to the authenticated user.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `BOT_TOKEN` | Yes | — | Telegram bot token |
| `MINI_APP_URL` | Yes | `http://localhost:5173` | Public HTTPS URL of the Mini App |
| `POST_DURATION_MINUTES` | No | `2` | How long time-based ads stay posted |
| `PAYMENT_TIMEOUT_HOURS` | No | `2` | Time for advertiser to pay after approval |
| `APPROVAL_TIMEOUT_HOURS` | No | `24` | Time for owner to approve/reject |
| `WITHDRAW_ADMIN_CHAT_ID` | No | `88766614` | Admin Telegram chat/user id for withdraw approvals |
| `MIN_WITHDRAW_TON` | No | `5` | Minimum amount required to create withdraw request |
| `TON_NETWORK` | No | `testnet` | TON network (`testnet` or `mainnet`) |
| `TON_WALLET_ADDRESS` | No | — | Platform TON wallet that receives advertiser payments |
| `TON_API_KEY` | No | — | TonCenter API key (used when payment verification is enabled) |

---

## Common Operations

### Rebuild after code changes

```bash
docker compose up -d --build --force-recreate
docker exec nginx nginx -s reload   # refresh Nginx DNS cache
```

### Run migrations

```bash
docker exec market-app npx tsx src/db/migrate.ts
```

### View logs

```bash
docker logs market-app --tail 50 -f       # backend + bot
docker logs market-mini-app --tail 50 -f   # frontend
```

### Access database

```bash
docker exec -it <postgres-container> psql -U <user> -d market
```

### Check container status

```bash
docker ps --filter "name=market"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **502 Bad Gateway** after rebuild | Run `docker exec nginx nginx -s reload` to refresh DNS |
| **"Bot can't initiate conversation"** | User must send `/start` to the bot first |
| **"Invalid input" on deal creation** | Check that image URLs are relative paths, not full URLs |
| **Earnings show 0** | Earnings only appear after a deal **completes** (not just paid) |
| **Withdraw button disabled** | Check `MIN_WITHDRAW_TON`, payout hold window, and whether an active withdraw request already exists |
| **Mini App blank in Telegram** | Ensure `MINI_APP_URL` is HTTPS and `allowedHosts` includes your domain in `vite.config.ts` |

---

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, grammY (Telegram bot)
- **Frontend:** React, Vite, TypeScript
- **Database:** PostgreSQL
- **Payments:** TON (escrow flow, tiered platform fee, withdraw requests)
- **Deployment:** Docker Compose
- **Validation:** Zod (env vars + API schemas)

---

## License

Private project. All rights reserved.
