# TG Ad Marketplace
## Read First
- This project follows the spec in `docs/PRD.md` — read it fully before implementing any new feature or if product behavior is unclear.
- All rules below are permanent — never violate them.
# Project Guardrails & Standards

## Always
- Before writing code: describe approach, ask for approval if ambiguous.
- Break tasks >3 files into smaller subtasks.
- After changes: list potential breakages + suggest tests.
- Bugs: write failing test first → fix until it passes.
- Use TDD when possible.
- Follow our style: [brief rules or link to eslint/prettier config].
- Preferred stack: [Next.js 15 / React Server Components / Tailwind / Zod / tRPC, etc.]
- When I correct you → immediately suggest adding the lesson here so it never repeats.

## When stuck / exploring
- Explore codebase first: summarize architecture, data flows, key modules.
- Ask clarifying questions before coding.

## Stack
TypeScript, Node.js, React, grammY, PostgreSQL, Telegram Mini App SDK, Telegram Stars

## Commands
```bash
npm run dev         # Dev server
npm run bot         # Telegram bot
npm run db:migrate  # Migrations
npm run test        # Tests
npm run lint        # Lint + format
npm run typecheck   # TS strict
```

## Structure
```
src/
├── bot/          # Telegram Bot (grammY) — handlers, jobs
├── api/          # REST API (Express) — routes, middleware
├── mini-app/     # React + Vite — pages, components, hooks
├── db/           # Migrations, schema, queries (all SQL lives here)
├── escrow/       # State machine + payment logic (all deal transitions live here)
├── shared/       # Types, constants, errors
└── config/       # Env validation (Zod)
```

## Rules

### Always
- Describe approach before coding if task touches >2 files
- All deal state transitions go through `src/escrow/` — nowhere else
- All SQL in `src/db/queries.ts` — never in routes or handlers
- Validate inputs with Zod at API boundary
- No `any` — deal status is a union type
- Every happy path must handle its failure (bot can't post → refund)

### Never
- Don't add features not in `docs/PRD.md` — no search, ratings, scheduling, analytics
- Don't use ORMs — parameterized SQL for 4 tables is fine
- Don't over-engineer — no abstract base classes, no DI containers, this is a 3-day build
- Don't bypass escrow — money always flows: hold → verify → release
- Don't auto-approve deals — owner MUST review ad content

### Danger Zones (extra caution, write tests first)
- `src/escrow/` — money logic, double-check every state transition
- Bot permissions — verify bot is channel admin before posting
- Deal status races — use DB-level locking on transitions

## Deal States
```
created → pending_approval → approved → escrow_held → posted → verified → completed
                ↓                                       ↓
            rejected                                 disputed → refunded
```

## Demo Config
`POST_DURATION_MINUTES=2` (not 24h) for demo purposes.

## Context Files
- `docs/PRD.md` — full product spec, user journeys, data model, edge cases, build order
- Read PRD.md before starting a new feature or if unclear on product behavior

## Corrections
<!-- Add lessons here when I correct you so they don't repeat -->
## Critical: Deal State Transitions
ONLY allowed:
- created → pending_approval
- pending_approval → approved | rejected
- approved → escrow_held | expired
- escrow_held → posted | refunded
- posted → verified | disputed
- verified → completed
- disputed → refunded

All transitions MUST go through src/escrow/ — no exceptions.
## Memory & Corrections
- When I correct you or add a new rule, immediately propose updating this CLAUDE.md file to include it permanently.
- Never repeat the same mistake twice.
- [Date] Never use default exports for components — breaks tree-shaking.
