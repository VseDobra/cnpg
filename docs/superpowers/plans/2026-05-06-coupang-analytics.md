# Coupang Analytics Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal Next.js analytics dashboard that syncs data from Coupang Open API every hour and displays it via web browser and Telegram Mini App.

**Architecture:** Next.js 14 (App Router) serves both the UI and API routes. A node-cron scheduler runs every hour to fetch data from Coupang Open API and upsert it into a local SQLite database via Prisma ORM.

**Tech Stack:** Next.js 14, TypeScript, Prisma, SQLite, Tailwind CSS, Recharts, node-cron, Telegram Bot API

---

## File Map

```
/
├── app/
│   ├── layout.tsx                  # Root layout with Sidebar
│   ├── page.tsx                    # Dashboard (KPIs, charts, tables)
│   ├── orders/page.tsx             # Orders list with filters
│   ├── products/page.tsx           # Product listings
│   ├── inventory/page.tsx          # Stock levels + alerts
│   ├── finance/page.tsx            # Settlements + net profit
│   ├── returns/page.tsx            # Return requests
│   ├── settings/page.tsx           # API keys + sync status
│   └── api/
│       ├── sync/route.ts           # POST: manual sync trigger
│       ├── dashboard/route.ts      # GET: KPIs + recent data
│       ├── orders/route.ts         # GET: orders list
│       ├── products/route.ts       # GET: products
│       ├── inventory/route.ts      # GET: stock levels
│       ├── finance/route.ts        # GET: settlements
│       └── returns/route.ts        # GET: returns
├── lib/
│   ├── coupang/
│   │   ├── client.ts               # HMAC auth + base HTTP fetch
│   │   ├── orders.ts               # Fetch orders from Coupang API
│   │   ├── products.ts             # Fetch products + inventory
│   │   └── settlements.ts          # Fetch settlement/payout data
│   ├── db.ts                       # Prisma singleton
│   └── sync.ts                     # Sync orchestrator (called by cron)
├── components/
│   ├── Sidebar.tsx                 # Navigation sidebar
│   ├── KpiCard.tsx                 # KPI metric card
│   ├── SalesChart.tsx              # Bar chart (Recharts)
│   ├── ProductsDonut.tsx           # Donut chart by product
│   ├── OrdersTable.tsx             # Orders table with status badges
│   ├── InventoryBar.tsx            # Stock level progress bar
│   └── AlertsList.tsx              # Notifications panel
├── prisma/
│   └── schema.prisma               # DB schema
├── .env.local                      # API keys (not committed)
└── instrumentation.ts              # Next.js hook to start cron on boot
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json` (via CLI)
- Create: `prisma/schema.prisma`
- Create: `.env.local`
- Create: `tailwind.config.ts`

- [ ] **Step 1: Create Next.js project**

```bash
cd "C:\Users\PC\Desktop\COUPANG API"
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

When prompted: answer defaults (Yes to all).

- [ ] **Step 2: Install dependencies**

```bash
npm install prisma @prisma/client node-cron recharts
npm install -D @types/node-cron
```

- [ ] **Step 3: Initialize Prisma with SQLite**

```bash
npx prisma init --datasource-provider sqlite
```

- [ ] **Step 4: Write the database schema**

Replace `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./coupang.db"
}

model Order {
  id              String   @id
  status          String
  orderedAt       DateTime
  shipByDate      DateTime?
  totalPrice      Int
  receiverName    String
  receiverAddress String
  items           OrderItem[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model OrderItem {
  id            String  @id @default(cuid())
  orderId       String
  order         Order   @relation(fields: [orderId], references: [id])
  productId     String
  productName   String
  quantity      Int
  unitPrice     Int
}

model Product {
  id            String   @id
  name          String
  status        String
  salePrice     Int
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Inventory {
  id            String   @id @default(cuid())
  productId     String   @unique
  vendorItemId  String
  quantity      Int
  updatedAt     DateTime @updatedAt
}

model Settlement {
  id            String   @id
  settledAt     DateTime
  amount        Int
  commission    Int
  netAmount     Int
  createdAt     DateTime @default(now())
}

model Return {
  id            String   @id
  orderId       String
  reason        String
  status        String
  requestedAt   DateTime
  createdAt     DateTime @default(now())
}

model SyncLog {
  id        String   @id @default(cuid())
  type      String
  status    String
  message   String?
  syncedAt  DateTime @default(now())
}
```

- [ ] **Step 5: Create .env.local**

```bash
cat > .env.local << 'EOF'
COUPANG_ACCESS_KEY=your_access_key_here
COUPANG_SECRET_KEY=your_secret_key_here
COUPANG_VENDOR_ID=your_vendor_id_here
EOF
```

- [ ] **Step 6: Run migration**

```bash
npx prisma migrate dev --name init
npx prisma generate
```

Expected output: `✔ Generated Prisma Client`

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: initial Next.js + Prisma + SQLite setup"
```

---

## Task 2: Coupang API Client

**Files:**
- Create: `lib/coupang/client.ts`
- Create: `lib/db.ts`

- [ ] **Step 1: Create Prisma singleton**

Create `lib/db.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 2: Create Coupang API client with HMAC auth**

Create `lib/coupang/client.ts`:

```typescript
import crypto from 'crypto'

const BASE_URL = 'https://api-gateway.coupang.com'

function generateSignature(
  method: string,
  path: string,
  datetime: string,
  secretKey: string
): string {
  // Coupang HMAC: datetime + method + path (including query string)
  const message = datetime + method + path
  return crypto.createHmac('sha256', secretKey).update(message).digest('hex')
}

function getDatetime(): string {
  // Format: yyMMddTHHmmssZ
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const yy = String(now.getUTCFullYear()).slice(2)
  const MM = pad(now.getUTCMonth() + 1)
  const dd = pad(now.getUTCDate())
  const HH = pad(now.getUTCHours())
  const mm = pad(now.getUTCMinutes())
  const ss = pad(now.getUTCSeconds())
  return `${yy}${MM}${dd}T${HH}${mm}${ss}Z`
}

export async function coupangRequest<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string
): Promise<T> {
  const accessKey = process.env.COUPANG_ACCESS_KEY!
  const secretKey = process.env.COUPANG_SECRET_KEY!
  const datetime = getDatetime()
  const signature = generateSignature(method, path, datetime, secretKey)

  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json;charset=UTF-8',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Coupang API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/
git commit -m "feat: Coupang API client with HMAC authentication"
```

---

## Task 3: Coupang API Fetchers

**Files:**
- Create: `lib/coupang/orders.ts`
- Create: `lib/coupang/products.ts`
- Create: `lib/coupang/settlements.ts`

> **Note:** Check your Coupang Wing Open API docs for exact endpoint paths and response shapes. The paths below follow the standard Coupang Open API v2 spec.

- [ ] **Step 1: Create orders fetcher**

Create `lib/coupang/orders.ts`:

```typescript
import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface CoupangOrder {
  orderId: string
  status: string
  orderedAt: string
  shipByDate?: string
  totalPrice: number
  receiver: { name: string; addr1: string; addr2: string }
  orderItems: Array<{
    vendorItemId: string
    productName: string
    quantity: number
    unitPrice: number
  }>
}

export async function fetchOrders(createdAtFrom: string, createdAtTo: string) {
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/ordersheets?createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=INSTRUCT&maxPerPage=100`
  const res = await coupangRequest<{ data: CoupangOrder[] }>('GET', path)
  return res.data ?? []
}
```

- [ ] **Step 2: Create products + inventory fetcher**

Create `lib/coupang/products.ts`:

```typescript
import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface CoupangProduct {
  sellerProductId: string
  sellerProductName: string
  displayCategoryCode: string
  salePrice: number
  statusName: string
  items: Array<{
    vendorItemId: string
    vendorItemName: string
    quantity: number
  }>
}

export async function fetchProducts() {
  const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products?vendorId=${VENDOR_ID}&status=APPROVED&limit=100`
  const res = await coupangRequest<{ data: CoupangProduct[] }>('GET', path)
  return res.data ?? []
}
```

- [ ] **Step 3: Create settlements fetcher**

Create `lib/coupang/settlements.ts`:

```typescript
import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface CoupangSettlement {
  remittanceId: string
  remittanceDate: string
  paymentAmount: number
  commissionAmount: number
}

export async function fetchSettlements(month: string) {
  // month format: YYYY-MM
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/feeinvoices?targetMonth=${month}`
  const res = await coupangRequest<{ data: CoupangSettlement[] }>('GET', path)
  return res.data ?? []
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/coupang/
git commit -m "feat: Coupang API fetchers for orders, products, settlements"
```

---

## Task 4: Sync Service + Cron Scheduler

**Files:**
- Create: `lib/sync.ts`
- Create: `instrumentation.ts`
- Create: `app/api/sync/route.ts`

- [ ] **Step 1: Create sync orchestrator**

Create `lib/sync.ts`:

```typescript
import { prisma } from './db'
import { fetchOrders } from './coupang/orders'
import { fetchProducts } from './coupang/products'
import { fetchSettlements } from './coupang/settlements'

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export async function runSync() {
  console.log('[sync] Starting sync at', new Date().toISOString())

  const now = new Date()
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000) // last 24h

  try {
    // Sync orders
    const orders = await fetchOrders(formatDate(from), formatDate(now))
    for (const o of orders) {
      await prisma.order.upsert({
        where: { id: o.orderId },
        create: {
          id: o.orderId,
          status: o.status,
          orderedAt: new Date(o.orderedAt),
          shipByDate: o.shipByDate ? new Date(o.shipByDate) : null,
          totalPrice: o.totalPrice,
          receiverName: o.receiver.name,
          receiverAddress: `${o.receiver.addr1} ${o.receiver.addr2}`,
          items: {
            create: o.orderItems.map(item => ({
              productId: item.vendorItemId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          },
        },
        update: {
          status: o.status,
          shipByDate: o.shipByDate ? new Date(o.shipByDate) : null,
        },
      })
    }
    await prisma.syncLog.create({ data: { type: 'orders', status: 'ok', message: `${orders.length} orders` } })

    // Sync products + inventory
    const products = await fetchProducts()
    for (const p of products) {
      await prisma.product.upsert({
        where: { id: p.sellerProductId },
        create: { id: p.sellerProductId, name: p.sellerProductName, status: p.statusName, salePrice: p.salePrice },
        update: { name: p.sellerProductName, status: p.statusName, salePrice: p.salePrice },
      })
      for (const item of p.items) {
        await prisma.inventory.upsert({
          where: { productId: p.sellerProductId },
          create: { productId: p.sellerProductId, vendorItemId: item.vendorItemId, quantity: item.quantity, updatedAt: now },
          update: { quantity: item.quantity, updatedAt: now },
        })
      }
    }
    await prisma.syncLog.create({ data: { type: 'products', status: 'ok', message: `${products.length} products` } })

    // Sync settlements (current month)
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const settlements = await fetchSettlements(month)
    for (const s of settlements) {
      await prisma.settlement.upsert({
        where: { id: s.remittanceId },
        create: {
          id: s.remittanceId,
          settledAt: new Date(s.remittanceDate),
          amount: s.paymentAmount,
          commission: s.commissionAmount,
          netAmount: s.paymentAmount - s.commissionAmount,
        },
        update: {},
      })
    }
    await prisma.syncLog.create({ data: { type: 'settlements', status: 'ok', message: `${settlements.length} settlements` } })

    console.log('[sync] Done')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.syncLog.create({ data: { type: 'all', status: 'error', message } })
    console.error('[sync] Error:', message)
  }
}
```

- [ ] **Step 2: Create Next.js instrumentation file (starts cron on boot)**

Create `instrumentation.ts` in project root:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cron = await import('node-cron')
    const { runSync } = await import('./lib/sync')

    // Run every hour at :00
    cron.schedule('0 * * * *', () => {
      runSync()
    })

    console.log('[cron] Hourly sync scheduler started')
  }
}
```

- [ ] **Step 3: Enable instrumentation in next.config**

Edit `next.config.ts`:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    instrumentationHook: true,
  },
}

export default nextConfig
```

- [ ] **Step 4: Create manual sync API route**

Create `app/api/sync/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { runSync } from '@/lib/sync'

export async function POST() {
  await runSync()
  return NextResponse.json({ ok: true, syncedAt: new Date().toISOString() })
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/sync.ts instrumentation.ts next.config.ts app/api/sync/
git commit -m "feat: hourly sync service with cron scheduler"
```

---

## Task 5: App Layout + Sidebar

**Files:**
- Create: `components/Sidebar.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Create Sidebar component**

Create `components/Sidebar.tsx`:

```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/', icon: '📊', label: 'Дашборд' },
  { href: '/orders', icon: '📦', label: 'Заказы' },
  { href: '/products', icon: '🏷️', label: 'Товары' },
  { href: '/inventory', icon: '📉', label: 'Склад' },
  { href: '/finance', icon: '💰', label: 'Финансы' },
  { href: '/returns', icon: '↩️', label: 'Возвраты' },
  { href: '/settings', icon: '⚙️', label: 'Настройки' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-[220px] bg-[#1a1d2e] border-r border-[#2d3148] flex flex-col">
      <div className="px-5 py-6 border-b border-[#2d3148]">
        <h2 className="text-white font-bold text-sm">🛒 Coupang</h2>
        <p className="text-[#6b7280] text-xs mt-0.5">Analytics Dashboard</p>
      </div>

      <nav className="flex-1 py-2">
        {NAV.map(({ href, icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-5 py-2.5 text-[13px] border-l-[3px] transition-colors ${
                active
                  ? 'text-blue-400 bg-[#1e2a4a] border-blue-400'
                  : 'text-[#9ca3af] border-transparent hover:text-white hover:bg-[#232640]'
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mx-4 mb-4 p-2.5 bg-[#1e2a4a] rounded-lg border border-[#2d4a6b] text-[11px] text-blue-400 text-center leading-relaxed">
        🔄 Синх каждый час
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Update root layout**

Replace `app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Coupang Analytics',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-[#0f1117] text-[#e2e8f0] min-h-screen">
        <Sidebar />
        <main className="ml-[220px] p-6 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Start dev server and verify layout renders**

```bash
npm run dev
```

Open `http://localhost:3000` — should see sidebar with navigation links on dark background.

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx app/layout.tsx
git commit -m "feat: app layout with sidebar navigation"
```

---

## Task 6: Dashboard Page

**Files:**
- Create: `app/api/dashboard/route.ts`
- Create: `components/KpiCard.tsx`
- Create: `components/SalesChart.tsx`
- Create: `components/OrdersTable.tsx`
- Create: `components/InventoryBar.tsx`
- Create: `components/AlertsList.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create dashboard API route**

Create `app/api/dashboard/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [orders, prevOrders, settlements, inventory, recentOrders, syncLogs] =
    await Promise.all([
      prisma.order.findMany({ where: { orderedAt: { gte: from } }, include: { items: true } }),
      prisma.order.findMany({ where: { orderedAt: { gte: new Date(from.getTime() - days * 24 * 60 * 60 * 1000), lt: from } } }),
      prisma.settlement.findMany({ where: { settledAt: { gte: from } } }),
      prisma.inventory.findMany({ include: {} }),
      prisma.order.findMany({ orderBy: { orderedAt: 'desc' }, take: 5, include: { items: true } }),
      prisma.syncLog.findMany({ orderBy: { syncedAt: 'desc' }, take: 5 }),
    ])

  const returns = await prisma.return.findMany({ where: { requestedAt: { gte: from } } })
  const prevReturns = await prisma.return.findMany({ where: { requestedAt: { gte: new Date(from.getTime() - days * 24 * 60 * 60 * 1000), lt: from } } })

  const revenue = orders.reduce((s, o) => s + o.totalPrice, 0)
  const prevRevenue = prevOrders.reduce((s, o) => s + o.totalPrice, 0)
  const netProfit = settlements.reduce((s, st) => s + st.netAmount, 0)

  // Daily sales for chart
  const dailySales: Record<string, number> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    dailySales[d.toISOString().split('T')[0]] = 0
  }
  for (const o of orders) {
    const key = o.orderedAt.toISOString().split('T')[0]
    if (key in dailySales) dailySales[key] += o.totalPrice
  }

  return NextResponse.json({
    kpis: {
      revenue,
      prevRevenue,
      orderCount: orders.length,
      prevOrderCount: prevOrders.length,
      returnCount: returns.length,
      prevReturnCount: prevReturns.length,
      netProfit,
    },
    dailySales: Object.entries(dailySales).map(([date, amount]) => ({ date, amount })),
    recentOrders: recentOrders.map(o => ({
      id: o.id,
      product: o.items[0]?.productName ?? '—',
      amount: o.totalPrice,
      date: o.orderedAt.toISOString().split('T')[0],
      status: o.status,
    })),
    inventory,
    syncLogs,
  })
}
```

- [ ] **Step 2: Create KpiCard component**

Create `components/KpiCard.tsx`:

```typescript
interface Props {
  label: string
  value: string
  change?: number
  changeLabel?: string
}

export default function KpiCard({ label, value, change, changeLabel }: Props) {
  const up = change !== undefined && change >= 0
  return (
    <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
      <p className="text-[11px] text-[#6b7280] mb-2">{label}</p>
      <p className="text-[22px] font-bold text-white mb-1">{value}</p>
      {change !== undefined && (
        <p className={`text-[11px] ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? '↑' : '↓'} {Math.abs(change)}% {changeLabel}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create SalesChart component**

Create `components/SalesChart.tsx`:

```typescript
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  data: { date: string; amount: number }[]
}

export default function SalesChart({ data }: Props) {
  const formatted = data.map(d => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  }))

  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={formatted} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#1a1d2e', border: '1px solid #2d3148', borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [`₩${v.toLocaleString()}`, '₩']}
        />
        <Bar dataKey="amount" fill="#3b82f6" radius={[3, 3, 0, 0]} opacity={0.85} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 4: Create OrdersTable component**

Create `components/OrdersTable.tsx`:

```typescript
const STATUS_STYLES: Record<string, string> = {
  DELIVERED: 'bg-[#064e3b] text-emerald-400',
  INSTRUCT: 'bg-[#1e3a5f] text-blue-400',
  WAITING_DELIVER: 'bg-[#1e3a5f] text-blue-400',
  CANCEL: 'bg-[#3d1515] text-red-400',
  RETURN: 'bg-[#3d1515] text-red-400',
  ACCEPT: 'bg-[#3d2c00] text-amber-400',
}

const STATUS_LABELS: Record<string, string> = {
  DELIVERED: 'Доставлен',
  INSTRUCT: 'Доставка',
  WAITING_DELIVER: 'Ожидает',
  CANCEL: 'Отменён',
  RETURN: 'Возврат',
  ACCEPT: 'В обработке',
}

interface Order {
  id: string
  product: string
  amount: number
  date: string
  status: string
}

export default function OrdersTable({ orders }: { orders: Order[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {['ID', 'Товар', 'Сумма', 'Дата', 'Статус'].map(h => (
            <th key={h} className="text-[10px] text-[#6b7280] uppercase tracking-wide px-3 py-2 text-left border-b border-[#2d3148]">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map(o => (
          <tr key={o.id} className="border-b border-[#1e2233] last:border-0">
            <td className="px-3 py-2.5 text-xs">#{o.id.slice(-7)}</td>
            <td className="px-3 py-2.5 text-xs">{o.product}</td>
            <td className="px-3 py-2.5 text-xs">₩{o.amount.toLocaleString()}</td>
            <td className="px-3 py-2.5 text-xs">{o.date}</td>
            <td className="px-3 py-2.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_STYLES[o.status] ?? 'bg-[#2d3148] text-gray-400'}`}>
                {STATUS_LABELS[o.status] ?? o.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 5: Create InventoryBar component**

Create `components/InventoryBar.tsx`:

```typescript
interface Props {
  productName: string
  quantity: number
  maxQuantity?: number
  lowThreshold?: number
}

export default function InventoryBar({ productName, quantity, maxQuantity = 100, lowThreshold = 10 }: Props) {
  const pct = Math.min((quantity / maxQuantity) * 100, 100)
  const color = quantity <= lowThreshold ? 'bg-amber-400' : 'bg-emerald-400'
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[11px] mb-1">
        <span>{productName}</span>
        <span className={quantity <= lowThreshold ? 'text-amber-400' : 'text-[#9ca3af]'}>
          {quantity} шт.{quantity <= lowThreshold ? ' ⚠️' : ''}
        </span>
      </div>
      <div className="h-1.5 bg-[#2d3148] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create AlertsList component**

Create `components/AlertsList.tsx`:

```typescript
interface Alert {
  icon: string
  text: string
  highlight: string
  time: string
}

export default function AlertsList({ alerts }: { alerts: Alert[] }) {
  return (
    <div>
      {alerts.map((a, i) => (
        <div key={i} className="flex gap-2 py-2.5 border-b border-[#1e2233] last:border-0 text-xs items-start">
          <span>{a.icon}</span>
          <span className="text-[#9ca3af]"><strong className="text-[#e2e8f0]">{a.highlight}</strong>{a.text}</span>
          <span className="ml-auto text-[10px] text-[#4b5563] whitespace-nowrap">{a.time}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Build dashboard page**

Replace `app/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import KpiCard from '@/components/KpiCard'
import SalesChart from '@/components/SalesChart'
import OrdersTable from '@/components/OrdersTable'
import InventoryBar from '@/components/InventoryBar'

type DashData = {
  kpis: { revenue: number; prevRevenue: number; orderCount: number; prevOrderCount: number; returnCount: number; prevReturnCount: number; netProfit: number }
  dailySales: { date: string; amount: number }[]
  recentOrders: { id: string; product: string; amount: number; date: string; status: string }[]
  inventory: { productId: string; quantity: number }[]
}

function pctChange(curr: number, prev: number) {
  if (prev === 0) return 0
  return Math.round(((curr - prev) / prev) * 100)
}

export default function Dashboard() {
  const [data, setData] = useState<DashData | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    fetch(`/api/dashboard?days=${days}`)
      .then(r => r.json())
      .then(setData)
  }, [days])

  if (!data) return <div className="text-[#6b7280] text-sm">Загрузка...</div>

  const { kpis } = data

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold">Главный дашборд</h1>
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md border text-xs ${days === d ? 'bg-[#1e2a4a] text-blue-400 border-blue-400' : 'bg-[#1a1d2e] text-[#9ca3af] border-[#2d3148]'}`}
            >
              {d === 7 ? '7 дней' : d === 30 ? '30 дней' : '3 мес'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard label="Выручка" value={`₩${kpis.revenue.toLocaleString()}`} change={pctChange(kpis.revenue, kpis.prevRevenue)} changeLabel="vs прошлый период" />
        <KpiCard label="Заказы" value={String(kpis.orderCount)} change={pctChange(kpis.orderCount, kpis.prevOrderCount)} changeLabel="vs прошлый период" />
        <KpiCard label="Возвраты" value={String(kpis.returnCount)} change={pctChange(kpis.returnCount, kpis.prevReturnCount)} changeLabel="vs прошлый период" />
        <KpiCard label="Чистая прибыль" value={`₩${kpis.netProfit.toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-5">
        <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
          <p className="text-[13px] font-semibold mb-4">Продажи по дням (₩)</p>
          <SalesChart data={data.dailySales} />
        </div>
        <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
          <p className="text-[13px] font-semibold mb-4">Склад</p>
          {data.inventory.map(inv => (
            <InventoryBar key={inv.productId} productName={inv.productId} quantity={inv.quantity} />
          ))}
        </div>
      </div>

      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        <div className="flex justify-between items-center mb-3">
          <p className="text-[13px] font-semibold">Последние заказы</p>
        </div>
        <OrdersTable orders={data.recentOrders} />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Verify dashboard renders at localhost:3000**

```bash
npm run dev
```

Open `http://localhost:3000` — should see KPI cards, chart area, and orders table (empty until first sync).

- [ ] **Step 9: Commit**

```bash
git add app/ components/
git commit -m "feat: dashboard page with KPIs, charts, orders table"
```

---

## Task 7: Orders + Returns Pages

**Files:**
- Create: `app/api/orders/route.ts`
- Create: `app/orders/page.tsx`
- Create: `app/api/returns/route.ts`
- Create: `app/returns/page.tsx`

- [ ] **Step 1: Orders API route**

Create `app/api/orders/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status')
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { orderedAt: 'desc' },
    take: 100,
    include: { items: true },
  })
  return NextResponse.json(orders)
}
```

- [ ] **Step 2: Orders page**

Create `app/orders/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import OrdersTable from '@/components/OrdersTable'

const STATUSES = ['', 'INSTRUCT', 'DELIVERED', 'CANCEL', 'RETURN']
const STATUS_LABELS: Record<string, string> = { '': 'Все', INSTRUCT: 'Доставка', DELIVERED: 'Доставлен', CANCEL: 'Отменён', RETURN: 'Возврат' }

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch(`/api/orders${status ? `?status=${status}` : ''}`)
      .then(r => r.json())
      .then(data => setOrders(data.map((o: any) => ({
        id: o.id,
        product: o.items[0]?.productName ?? '—',
        amount: o.totalPrice,
        date: o.orderedAt.split('T')[0],
        status: o.status,
      }))))
  }, [status])

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Заказы</h1>
      <div className="flex gap-2 mb-4">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1 rounded-md border text-xs ${status === s ? 'bg-[#1e2a4a] text-blue-400 border-blue-400' : 'bg-[#1a1d2e] text-[#9ca3af] border-[#2d3148]'}`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        <OrdersTable orders={orders} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Returns API route**

Create `app/api/returns/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const returns = await prisma.return.findMany({ orderBy: { requestedAt: 'desc' } })
  return NextResponse.json(returns)
}
```

- [ ] **Step 4: Returns page**

Create `app/returns/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'

export default function ReturnsPage() {
  const [returns, setReturns] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/returns').then(r => r.json()).then(setReturns)
  }, [])

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Возвраты</h1>
      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['ID', 'Заказ', 'Причина', 'Статус', 'Дата'].map(h => (
                <th key={h} className="text-[10px] text-[#6b7280] uppercase tracking-wide px-3 py-2 text-left border-b border-[#2d3148]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {returns.map(r => (
              <tr key={r.id} className="border-b border-[#1e2233] last:border-0">
                <td className="px-3 py-2.5 text-xs">#{r.id.slice(-7)}</td>
                <td className="px-3 py-2.5 text-xs">#{r.orderId.slice(-7)}</td>
                <td className="px-3 py-2.5 text-xs">{r.reason}</td>
                <td className="px-3 py-2.5 text-xs">{r.status}</td>
                <td className="px-3 py-2.5 text-xs">{r.requestedAt?.split('T')[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {returns.length === 0 && <p className="text-[#6b7280] text-sm text-center py-4">Возвратов нет</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/orders/ app/returns/ app/api/orders/ app/api/returns/
git commit -m "feat: orders and returns pages"
```

---

## Task 8: Products + Inventory Pages

**Files:**
- Create: `app/api/products/route.ts`
- Create: `app/products/page.tsx`
- Create: `app/api/inventory/route.ts`
- Create: `app/inventory/page.tsx`

- [ ] **Step 1: Products API route**

Create `app/api/products/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const products = await prisma.product.findMany({ orderBy: { updatedAt: 'desc' } })
  return NextResponse.json(products)
}
```

- [ ] **Step 2: Products page**

Create `app/products/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([])
  useEffect(() => { fetch('/api/products').then(r => r.json()).then(setProducts) }, [])

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Товары</h1>
      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['ID', 'Название', 'Цена', 'Статус'].map(h => (
                <th key={h} className="text-[10px] text-[#6b7280] uppercase tracking-wide px-3 py-2 text-left border-b border-[#2d3148]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-b border-[#1e2233] last:border-0">
                <td className="px-3 py-2.5 text-xs">{p.id}</td>
                <td className="px-3 py-2.5 text-xs">{p.name}</td>
                <td className="px-3 py-2.5 text-xs">₩{p.salePrice.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-xs">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <p className="text-[#6b7280] text-sm text-center py-4">Нет данных. Запустите синхронизацию в Настройках.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Inventory API route**

Create `app/api/inventory/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const inventory = await prisma.inventory.findMany({ orderBy: { updatedAt: 'desc' } })
  return NextResponse.json(inventory)
}
```

- [ ] **Step 4: Inventory page**

Create `app/inventory/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import InventoryBar from '@/components/InventoryBar'

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([])
  useEffect(() => { fetch('/api/inventory').then(r => r.json()).then(setItems) }, [])

  const low = items.filter(i => i.quantity <= 10)

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Склад</h1>
      {low.length > 0 && (
        <div className="mb-4 p-4 bg-[#3d2c00] border border-amber-600 rounded-xl text-amber-400 text-sm">
          ⚠️ Мало остатков: {low.map(i => i.productId).join(', ')}
        </div>
      )}
      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        {items.map(inv => (
          <InventoryBar key={inv.productId} productName={inv.productId} quantity={inv.quantity} />
        ))}
        {items.length === 0 && <p className="text-[#6b7280] text-sm text-center py-4">Нет данных.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/products/ app/inventory/ app/api/products/ app/api/inventory/
git commit -m "feat: products and inventory pages"
```

---

## Task 9: Finance Page

**Files:**
- Create: `app/api/finance/route.ts`
- Create: `app/finance/page.tsx`

- [ ] **Step 1: Finance API route**

Create `app/api/finance/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const settlements = await prisma.settlement.findMany({ orderBy: { settledAt: 'desc' } })
  const total = settlements.reduce((s, st) => ({ amount: s.amount + st.amount, commission: s.commission + st.commission, net: s.net + st.netAmount }), { amount: 0, commission: 0, net: 0 })
  return NextResponse.json({ settlements, total })
}
```

- [ ] **Step 2: Finance page**

Create `app/finance/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'

export default function FinancePage() {
  const [data, setData] = useState<any>(null)
  useEffect(() => { fetch('/api/finance').then(r => r.json()).then(setData) }, [])

  if (!data) return <div className="text-[#6b7280] text-sm">Загрузка...</div>

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Финансы</h1>
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Выплаты (всего)', value: `₩${data.total.amount.toLocaleString()}` },
          { label: 'Комиссия Coupang', value: `₩${data.total.commission.toLocaleString()}` },
          { label: 'Чистая прибыль', value: `₩${data.total.net.toLocaleString()}` },
        ].map(c => (
          <div key={c.label} className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
            <p className="text-[11px] text-[#6b7280] mb-2">{c.label}</p>
            <p className="text-xl font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['ID', 'Дата выплаты', 'Сумма', 'Комиссия', 'Чистая'].map(h => (
                <th key={h} className="text-[10px] text-[#6b7280] uppercase tracking-wide px-3 py-2 text-left border-b border-[#2d3148]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.settlements.map((s: any) => (
              <tr key={s.id} className="border-b border-[#1e2233] last:border-0">
                <td className="px-3 py-2.5 text-xs">{s.id}</td>
                <td className="px-3 py-2.5 text-xs">{s.settledAt?.split('T')[0]}</td>
                <td className="px-3 py-2.5 text-xs">₩{s.amount.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-xs text-red-400">-₩{s.commission.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-xs text-emerald-400">₩{s.netAmount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.settlements.length === 0 && <p className="text-[#6b7280] text-sm text-center py-4">Нет данных о выплатах.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/finance/ app/api/finance/
git commit -m "feat: finance page with settlements and net profit"
```

---

## Task 10: Settings Page

**Files:**
- Create: `app/settings/page.tsx`

- [ ] **Step 1: Settings page with sync trigger and log**

Create `app/settings/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [syncing, setSyncing] = useState(false)

  const loadLogs = () =>
    fetch('/api/sync-logs').then(r => r.json()).then(setLogs)

  useEffect(() => { loadLogs() }, [])

  const handleSync = async () => {
    setSyncing(true)
    await fetch('/api/sync', { method: 'POST' })
    await loadLogs()
    setSyncing(false)
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Настройки</h1>
      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148] mb-4">
        <p className="text-sm font-semibold mb-3">Синхронизация</p>
        <p className="text-xs text-[#6b7280] mb-4">Данные синхронизируются автоматически каждый час. Нажмите кнопку для ручного запуска.</p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-[#2d3148] disabled:text-[#6b7280] text-white text-sm rounded-lg transition-colors"
        >
          {syncing ? '⏳ Синхронизация...' : '🔄 Синхронизировать сейчас'}
        </button>
      </div>
      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        <p className="text-sm font-semibold mb-3">Журнал синхронизации</p>
        {logs.map((log: any) => (
          <div key={log.id} className="flex gap-3 py-2 border-b border-[#1e2233] last:border-0 text-xs">
            <span>{log.status === 'ok' ? '✅' : '❌'}</span>
            <span className="text-[#9ca3af]">{log.type}</span>
            <span className="text-[#6b7280]">{log.message}</span>
            <span className="ml-auto text-[#4b5563]">{log.syncedAt?.split('T')[0]}</span>
          </div>
        ))}
        {logs.length === 0 && <p className="text-[#6b7280] text-sm py-2">Синхронизаций ещё не было.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add sync-logs API route**

Create `app/api/sync-logs/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const logs = await prisma.syncLog.findMany({ orderBy: { syncedAt: 'desc' }, take: 20 })
  return NextResponse.json(logs)
}
```

- [ ] **Step 3: Commit**

```bash
git add app/settings/ app/api/sync-logs/
git commit -m "feat: settings page with manual sync trigger and logs"
```

---

## Task 11: Telegram Mini App

**Files:**
- Create: `app/tg/page.tsx`
- Create: `app/tg/layout.tsx`

> **Prerequisites:** You need a Telegram Bot token and a public URL. For local development use [ngrok](https://ngrok.com): `ngrok http 3000`

- [ ] **Step 1: Install Telegram SDK**

```bash
npm install @twa-dev/sdk
```

- [ ] **Step 2: Create Telegram layout (no sidebar)**

Create `app/tg/layout.tsx`:

```typescript
export default function TgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0f1117] text-[#e2e8f0] min-h-screen p-4">
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create Telegram Mini App page**

Create `app/tg/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import KpiCard from '@/components/KpiCard'

function pctChange(curr: number, prev: number) {
  if (prev === 0) return 0
  return Math.round(((curr - prev) / prev) * 100)
}

export default function TelegramApp() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then(({ default: WebApp }) => {
        WebApp.ready()
        WebApp.expand()
      })
    }
    fetch('/api/dashboard?days=30').then(r => r.json()).then(setData)
  }, [])

  if (!data) return <div className="text-[#6b7280] text-sm">Загрузка...</div>

  const { kpis } = data

  return (
    <div>
      <h1 className="text-base font-bold mb-4">🛒 Coupang</h1>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <KpiCard label="Выручка" value={`₩${kpis.revenue.toLocaleString()}`} change={pctChange(kpis.revenue, kpis.prevRevenue)} changeLabel="" />
        <KpiCard label="Заказы" value={String(kpis.orderCount)} change={pctChange(kpis.orderCount, kpis.prevOrderCount)} changeLabel="" />
        <KpiCard label="Возвраты" value={String(kpis.returnCount)} />
        <KpiCard label="Прибыль" value={`₩${kpis.netProfit.toLocaleString()}`} />
      </div>
      <div className="bg-[#1a1d2e] rounded-xl p-4 border border-[#2d3148]">
        <p className="text-xs font-semibold mb-3">Последние заказы</p>
        {data.recentOrders.map((o: any) => (
          <div key={o.id} className="flex justify-between py-2 border-b border-[#1e2233] last:border-0 text-xs">
            <span className="text-[#9ca3af]">{o.product}</span>
            <span>₩{o.amount.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Register Mini App in Telegram**

1. Open Telegram → search `@BotFather`
2. Send `/newbot` → follow steps → save the bot token
3. Send `/newapp` → select your bot → set Web App URL to your public URL + `/tg`
4. Users can open Mini App via the bot

- [ ] **Step 5: Commit**

```bash
git add app/tg/
git commit -m "feat: Telegram Mini App at /tg route"
```

---

## Self-Review Checklist

- [x] All 8 spec sections covered: dashboard, orders, products, inventory, finance, returns, settings, Telegram
- [x] No TBD or TODO placeholders
- [x] `prisma` singleton used consistently across all API routes via `lib/db.ts`
- [x] `coupangRequest` used consistently in all fetchers
- [x] `OrdersTable` component reused in both dashboard and orders page
- [x] `InventoryBar` component reused in dashboard and inventory page
- [x] All API routes follow same pattern: GET returns JSON, error handling via try/catch in sync
- [x] `.env.local` variables consistent: `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`, `COUPANG_VENDOR_ID`
