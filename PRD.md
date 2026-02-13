# PRD — TG Ad Marketplace MVP

> Read this before starting a new feature or when unclear on product behavior.

## Product
Escrow-powered ad placement for Telegram channels. Advertisers browse → deal → owner approves → pay → bot posts → bot verifies → release.

## Users

**Advertiser (Buyer)**: Wants ad posted in active channel. Fears paying and getting nothing. Browses catalog → creates deal → pays → waits.

**Channel Owner (Seller)**: Wants passive income. Fears posting ad and not getting paid. Lists channel → reviews deal → approves → gets paid.

## The ONE Flow

1. Owner lists channel (bot added as admin, sets price/duration/category)
2. Advertiser browses catalog, picks channel, writes ad copy
3. Owner gets notified, reviews ad content, approves or rejects
4. Advertiser pays (Telegram Stars) → escrow holds
5. Bot auto-posts ad to channel immediately
6. Timer runs (configurable, 2min for demo)
7. Bot verifies post still exists
8. If yes → release payment. If no → refund.

## Deal State Machine

```
created → pending_approval → approved → escrow_held → posted → verified → completed
                ↓                                       ↓
            rejected                                 disputed → refunded
```

Valid transitions:
- `created` → `pending_approval`
- `pending_approval` → `approved` | `rejected`
- `approved` → `escrow_held` | `expired` (2h payment timeout)
- `escrow_held` → `posted` | `refunded` (bot post failure)
- `posted` → `verified` | `disputed` (post deleted early)
- `verified` → `completed`
- `disputed` → `refunded`

## Data Model

```sql
users:         id, telegram_id, role, created_at
channels:      id, owner_id, telegram_channel_id, username, subscribers, category, price, duration_hours, bot_is_admin, is_active
deals:         id, advertiser_id, channel_id, ad_text, ad_image_url?, duration_hours, price, status, posted_message_id?, posted_at?, verified_at?, paid_at?, completed_at?, rejection_reason?, created_at, updated_at
transactions:  id, deal_id, type(hold|release|refund), amount, payment_method, status, created_at
```

## Telegram API Reference

```typescript
// Mini App: user identity
window.Telegram.WebApp.initDataUnsafe.user  // { id, first_name, username }
window.Telegram.WebApp.initData              // validate on backend

// Bot: verify admin status
bot.api.getChatMember(channelId, botId)

// Bot: post to channel
bot.api.sendMessage(channelId, adText)
bot.api.sendPhoto(channelId, photoUrl, { caption: adText })

// Bot: verify post exists (try forwarding — throws if deleted)

// Payments: Telegram Stars
bot.api.sendInvoice(userId, { provider_token: "", prices: [{ amount }] })
bot.on("pre_checkout_query", ...)
bot.on("successful_payment", ...)
```

## Edge Cases

| Case | Detection | Response |
|------|-----------|----------|
| Bot removed from channel | sendMessage throws 403 | Refund, mark channel inactive |
| Post deleted before timer | Message check fails | Refund via disputed → refunded |
| Advertiser doesn't pay | approved deals > 2h old | Auto-expire |
| Owner never responds | pending_approval > 24h | Auto-expire, notify advertiser |
| Duplicate submissions | DB unique: 1 active deal per advertiser+channel | Return existing |
| Bot API down during post | sendMessage fails | Retry 3x with backoff, then refund |

## Screens (10 total)

**Shared**: Home/role selector, My Deals
**Advertiser**: Catalog, Channel detail, Create deal, Deal detail (pay button + status)
**Owner**: List channel, Incoming deals, Deal review (approve/reject), My channel

## Build Order

### Day 1: Spine
- Project setup, DB schema + migrations (4 tables)
- Deal state machine with tests
- Bot setup: /start, channel admin verification
- API: CRUD channels + deals

### Day 2: Core Flow
- Bot: auto-post on escrow_held
- Bot: verification job (check post after timer)
- Bot: refund on failure
- Mini App: catalog, deal creation, deal detail
- Telegram Stars payment (or mock)

### Day 3: Polish
- Owner flow UI (list channel, review, approve/reject)
- Bot DM notifications
- Top edge cases
- Full happy path test
- Demo prep

## Environment
```
DATABASE_URL=postgresql://...
BOT_TOKEN=...
MINI_APP_URL=https://...
POST_DURATION_MINUTES=2
PAYMENT_TIMEOUT_HOURS=2
APPROVAL_TIMEOUT_HOURS=24
```

## Scoring (Contest)
P0: Complete deal state machine, working escrow, bot auto-post + verify
P1: Clean UI for both users, edge case handling
P2: Bot notifications, live Telegram API data

## NOT in MVP
Search, filters, ratings, reviews, scheduling, analytics, TON wallet, dispute UI, multi-format ads, admin dashboard.
