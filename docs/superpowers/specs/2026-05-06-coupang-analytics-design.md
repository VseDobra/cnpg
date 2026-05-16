# Coupang Analytics Dashboard — Design Spec

**Date:** 2026-05-06  
**Status:** Approved

## Overview

Personal analytics dashboard for a Coupang Wing seller. Pulls data from Coupang Open API every hour, stores it locally in SQLite, and presents it via a Next.js web app and Telegram Mini App.

## Goals

- Full visibility into orders, products, inventory, finances, and returns
- Hourly data sync from Coupang Open API
- Accessible via web browser (localhost or VPS) and Telegram Mini App
- Built in JavaScript, single codebase

## Architecture

```
Coupang Open API
      ↓ (every hour via node-cron)
Sync Service (Next.js API route + cron)
      ↓
SQLite Database (via Prisma ORM)
      ↓
Next.js API Routes (/api/*)
      ↓
┌─────────────────┬──────────────────┐
Web Browser        Telegram Mini App
(localhost/VPS)    (same Next.js app)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | SQLite via Prisma ORM |
| Charts | Recharts |
| Styling | Tailwind CSS |
| Scheduler | node-cron (hourly sync) |
| Telegram | Telegram Bot API + Mini App |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Main dashboard: KPIs, sales chart, recent orders, inventory summary, alerts |
| `/orders` | Full order list with filters (status, date, product) |
| `/products` | Product listings, prices, status |
| `/inventory` | Stock levels with low-stock warnings |
| `/finance` | Settlement payouts, commissions, net profit by period |
| `/returns` | Return requests and reasons |
| `/settings` | Coupang API keys, sync interval, Telegram setup |

## Data Synced from Coupang API

- Orders (list, details, shipping status)
- Products (listings, prices, inventory)
- Returns / cancellations
- Settlements (payouts, commissions)

## Database Schema (Prisma)

Core models: `Order`, `OrderItem`, `Product`, `Inventory`, `Settlement`, `Return`, `SyncLog`

## Sync Service

- Runs every hour via `node-cron`
- Fetches incremental data (last sync timestamp)
- Upserts records into SQLite
- Logs sync status and errors

## Telegram Mini App

- Same Next.js app served at `/tg` route
- Mobile-optimized layout
- Uses `@twa-dev/sdk` for Telegram integration
- Requires public URL (VPS or ngrok for local dev)

## KPI Cards (Dashboard)

- Revenue (7d / 30d / 3mo selectable)
- Order count + change vs previous period
- Return count + rate
- Net profit (revenue minus Coupang commissions)

## Error Handling

- API sync failures logged to `SyncLog` table, shown in Settings page
- Low stock alerts shown in dashboard notification panel
- Failed syncs retry on next hourly tick

## Development Phases

1. Project setup (Next.js + Prisma + SQLite)
2. Coupang API client + authentication (HMAC)
3. Database schema + migrations
4. Sync service (cron + API fetching)
5. Dashboard page + KPI cards
6. Orders, Products, Inventory, Finance, Returns pages
7. Telegram Mini App integration
8. Settings page (API keys, sync status)
