# Fox Deal — Telegram Ad Marketplace

Fox Deal is a Telegram Mini App marketplace where **channel owners** list their channels for advertising and **advertisers** purchase ad placements using **Telegram Stars**. The platform supports both **time-based** and **cost-per-click (CPC)** pricing models with built-in escrow, automated posting, verification, and earnings tracking.

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
docker network create dolphia
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

This creates all required tables (`users`, `channels`, `deals`, `transactions`, `owner_earnings`) and applies any pending schema changes.

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
│   │       ├── channels.ts     # Channel CRUD
│   │       ├── deals.ts        # Deal creation, approve/reject/cancel
│   │       ├── payments.ts     # Telegram Stars invoice creation
│   │       ├── earnings.ts     # Owner earnings summary + history
│   │       └── upload.ts       # Image upload/serving
│   │
│   ├── bot/                    # Telegram bot (grammY)
│   │   ├── index.ts            # Bot setup, /start command, payment handlers
│   │   ├── admin.ts            # Channel admin checks, posting, message verification
│   │   ├── jobs.ts             # Auto-post, monitoring, CPC completion
│   │   ├── payments.ts         # Invoice creation, payment processing
│   │   ├── notifications.ts    # DM notifications to users
│   │   ├── expiry.ts           # Deal expiry background job
│   │   └── channelCheck.ts     # Periodic bot admin verification
│   │
│   ├── db/                     # Database layer
│   │   ├── index.ts            # PostgreSQL connection pool
│   │   ├── queries.ts          # All SQL queries
│   │   ├── migrate.ts          # Migration runner
│   │   └── migrations/         # SQL migration files (001–006)
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
│           ├── Catalog.tsx     # Browse channels
│           ├── ChannelDetail.tsx  # Create deal (time/CPC selector)
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
3. **Advertiser** pays via Telegram Stars
4. **Bot** auto-posts the ad to the channel
5. **Bot** monitors the post:
   - **Time-based:** checks if post stays up for the full duration → completes
   - **CPC:** tracks clicks, deducts from budget → completes when budget exhausted
6. On completion: owner gets **95%** (rounded down), platform keeps **5%**
7. Earnings are held for **30 days** before payout

---

## Pricing Models

### Time-based
- Channel owner sets a **price** (Stars) and **duration** (hours)
- Advertiser pays the full price upfront
- Ad stays posted for the duration; payment released after verification

### Cost-per-Click (CPC)
- Channel owner sets a **CPC price** (Stars per click, supports decimals e.g. 0.5)
- Advertiser sets a **total budget** (integer Stars) and must provide a link
- Each click on the inline button deducts the CPC price from the budget
- When budget is exhausted, the post is automatically removed
- Owner receives the spent amount (floored to integer); unspent budget is refunded

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
| **Mini App blank in Telegram** | Ensure `MINI_APP_URL` is HTTPS and `allowedHosts` includes your domain in `vite.config.ts` |

---

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, grammY (Telegram bot)
- **Frontend:** React, Vite, TypeScript
- **Database:** PostgreSQL
- **Payments:** Telegram Stars (native bot payments)
- **Deployment:** Docker Compose
- **Validation:** Zod (env vars + API schemas)

---

## License

Private project. All rights reserved.
