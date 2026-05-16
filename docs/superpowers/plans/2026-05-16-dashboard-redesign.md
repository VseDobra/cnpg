# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire dashboard to Slate & Cyan palette with SVG Lucide icons and a restructured KPI layout (2 featured + 3 secondary).

**Architecture:** Pure visual changes — no API, data, or logic changes. Update color tokens in all components from the old `#1a1d2e / #6366f1` palette to the new `#0f172a / #0ea5e9 / #22d3ee` palette. Restructure `app/page.tsx` KPI block. No new files needed except the lucide-react package.

**Tech Stack:** Next.js 16, Tailwind CSS, lucide-react (new), recharts (existing)

**Note on tests:** This project has no test infrastructure. All tasks end with a browser visual check instead of automated tests.

---

### Task 1: Install lucide-react

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
npm install lucide-react
```

Expected output: `added 1 package` (or similar), no errors.

- [ ] **Step 2: Verify import works**

Check that the package exists:
```bash
ls node_modules/lucide-react/dist
```
Expected: directory listing with `index.js` or similar.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lucide-react for sidebar icons"
```

---

### Task 2: Base styles — globals.css and layout.tsx

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update globals.css**

Replace the entire file content:

```css
@import "tailwindcss";

body {
  background: #030712;
  color: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

- [ ] **Step 2: Update layout.tsx body className**

In `app/layout.tsx`, change the `<body>` className:

```tsx
<body className="bg-[#030712] text-[#e2e8f0] min-h-screen" suppressHydrationWarning>
```

- [ ] **Step 3: Visual check**

Open http://localhost:3000 — background should be noticeably darker (near-black `#030712` instead of `#0f1117`).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "style: update base background to slate palette"
```

---

### Task 3: Sidebar — SVG Lucide icons and new palette

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar.tsx**

Replace the entire file:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, List, Store, Image, Package,
  DollarSign, Undo2, Tag, MessageSquare, Search, TrendingUp, Settings2
} from 'lucide-react'

const NAV = [
  { href: '/', icon: LayoutGrid, label: 'Дашборд' },
  { href: '/orders', icon: List, label: 'Заказы' },
  { href: '/products', icon: Store, label: 'Товары' },
  { href: '/photos', icon: Image, label: 'Фото товаров' },
  { href: '/inventory', icon: Package, label: 'Склад' },
  { href: '/finance', icon: DollarSign, label: 'Финансы' },
  { href: '/returns', icon: Undo2, label: 'Возвраты' },
  { href: '/coupons', icon: Tag, label: 'Купоны' },
  { href: '/inquiries', icon: MessageSquare, label: 'Вопросы' },
  { href: '/research', icon: Search, label: 'Категории' },
  { href: '/trends', icon: TrendingUp, label: 'Тренды' },
  { href: '/settings', icon: Settings2, label: 'Настройки' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-[220px] bg-[#0f172a] border-r border-[#1e293b] flex flex-col">
      <div className="px-4 py-5 border-b border-[#1e293b]">
        <h2 className="text-[#f1f5f9] font-bold text-[15px] tracking-tight">Coupang</h2>
        <p className="text-[#475569] text-[11px] mt-0.5">Analytics Dashboard</p>
      </div>

      <nav className="flex-1 py-2">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-4 py-[9px] text-[12.5px] border-l-2 transition-colors ${
                active
                  ? 'text-[#22d3ee] bg-[#0c1628] border-[#22d3ee]'
                  : 'text-[#64748b] border-transparent hover:text-[#cbd5e1] hover:bg-[#0f172a]'
              }`}
            >
              <Icon size={15} strokeWidth={2} className="flex-shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mx-3 mb-4 p-2.5 bg-[#0c1628] rounded-lg border border-[#164e63] text-[11px] text-[#22d3ee] text-center">
        ↻ Синхронизация каждый час
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Visual check**

Open http://localhost:3000 — sidebar should show SVG icons instead of emoji, cyan active state, darker background.

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "style: replace emoji icons with Lucide SVG in sidebar"
```

---

### Task 4: KpiCard — featured variant and new palette

**Files:**
- Modify: `components/KpiCard.tsx`

- [ ] **Step 1: Rewrite KpiCard.tsx**

Replace the entire file:

```tsx
interface Props {
  label: string
  value: string
  change?: number
  changeLabel?: string
  featured?: boolean
}

export default function KpiCard({ label, value, change, changeLabel, featured = false }: Props) {
  const up = change !== undefined && change >= 0

  if (featured) {
    return (
      <div className="relative overflow-hidden rounded-xl p-5 border border-[#1e3a5f]"
        style={{ background: 'linear-gradient(135deg, #0c1628, #0f172a)' }}>
        <div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, #0ea5e9, #22d3ee)' }} />
        <p className="text-[11px] uppercase tracking-[0.8px] text-[#475569] mb-2">{label}</p>
        <p className="text-[28px] font-bold text-[#f1f5f9] tracking-tight leading-none mb-1.5">{value}</p>
        {change !== undefined && (
          <p className={`text-[12px] ${up ? 'text-[#22d3ee]' : 'text-[#f87171]'}`}>
            {up ? '↑' : '↓'} {Math.abs(change)}% {changeLabel}
          </p>
        )}
        {change === undefined && changeLabel && (
          <p className="text-[11px] text-[#334155]">{changeLabel}</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-[#0f172a] rounded-xl p-4 border border-[#1e293b]">
      <p className="text-[10px] uppercase tracking-[0.6px] text-[#475569] mb-1.5">{label}</p>
      <p className="text-[18px] font-semibold text-[#e2e8f0] mb-1">{value}</p>
      {change !== undefined && (
        <p className={`text-[11px] ${up ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
          {up ? '↑' : '↓'} {Math.abs(change)}% {changeLabel}
        </p>
      )}
      {change === undefined && changeLabel && (
        <p className="text-[11px] text-[#475569]">{changeLabel}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/KpiCard.tsx
git commit -m "style: add featured variant to KpiCard with cyan accent line"
```

---

### Task 5: Dashboard page — restructure KPI layout

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace KPI section and update all color classes**

Replace the entire `app/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import KpiCard from '@/components/KpiCard'
import SalesChart from '@/components/SalesChart'
import OrdersTable from '@/components/OrdersTable'
import InventoryBar from '@/components/InventoryBar'
import ProductBreakdown from '@/components/ProductBreakdown'
import DowHeatmap from '@/components/DowHeatmap'

type DashData = {
  kpis: {
    revenue: number; prevRevenue: number
    orderCount: number; prevOrderCount: number; unitsSold: number; prevUnitsSold: number
    returnCount: number; prevReturnCount: number
    netProfit: number; hasCostData: boolean
    avgOrderValue: number; prevAvgOrderValue: number
    todayRevenue: number; yesterdayRevenue: number
    thisWeekRevenue: number; lastWeekRevenue: number
  }
  dailySales: { date: string; amount: number; profit: number }[]
  dowSales: { day: string; amount: number; orders: number }[]
  recentOrders: { id: string; product: string; amount: number; date: string; status: string; imageUrl?: string | null }[]
  productBreakdown: { name: string; imageUrl: string | null; revenue: number; orderCount: number; quantity: number; profit: number | null; margin: number | null }[]
  inventory: { productId: string; quantity: number; productName: string; imageUrl: string | null; salesLast30Days: number }[]
}

function pctChange(curr: number, prev: number) {
  if (prev === 0) return 0
  return Math.round(((curr - prev) / prev) * 100)
}

export default function Dashboard() {
  const [data, setData] = useState<DashData | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    fetch(`/api/dashboard?days=${days}`).then(r => r.json()).then(setData)
  }, [days])

  if (!data) return <div className="text-[#475569] text-sm">Загрузка...</div>

  const { kpis } = data

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-[17px] font-semibold text-[#f1f5f9] tracking-tight">Главный дашборд</h1>
        <div className="flex gap-1.5">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md border text-xs transition-colors ${
                days === d
                  ? 'bg-[#0c1628] text-[#22d3ee] border-[#22d3ee]'
                  : 'bg-[#0f172a] text-[#64748b] border-[#1e293b] hover:text-[#cbd5e1]'
              }`}
            >
              {d === 7 ? '7 дней' : d === 30 ? '30 дней' : '3 мес'}
            </button>
          ))}
        </div>
      </div>

      {/* Featured KPIs — 2 big cards */}
      <div className="grid grid-cols-2 gap-3 mb-2.5">
        <KpiCard
          featured
          label="Продажи"
          value={`₩${kpis.revenue.toLocaleString()}`}
          change={pctChange(kpis.revenue, kpis.prevRevenue)}
          changeLabel="vs прошлый период"
        />
        <KpiCard
          featured
          label="Заказы"
          value={String(kpis.orderCount)}
          change={pctChange(kpis.orderCount, kpis.prevOrderCount)}
          changeLabel="vs прошлый период"
        />
      </div>

      {/* Secondary KPIs — 3 smaller cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard
          label="Средний чек"
          value={`₩${kpis.avgOrderValue.toLocaleString()}`}
          change={pctChange(kpis.avgOrderValue, kpis.prevAvgOrderValue)}
          changeLabel="vs прошлый период"
        />
        <KpiCard
          label="Возвраты"
          value={String(kpis.returnCount)}
          change={pctChange(kpis.returnCount, kpis.prevReturnCount)}
          changeLabel="vs прошлый период"
        />
        <KpiCard
          label="Чистая прибыль"
          value={kpis.hasCostData ? `₩${kpis.netProfit.toLocaleString()}` : '—'}
          changeLabel={kpis.hasCostData ? undefined : 'Укажи себестоимость в товарах'}
        />
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Сегодня', curr: kpis.todayRevenue, prev: kpis.yesterdayRevenue },
          { label: 'Вчера', curr: kpis.yesterdayRevenue, prev: null },
          { label: 'Эта неделя', curr: kpis.thisWeekRevenue, prev: kpis.lastWeekRevenue },
          { label: 'Прошлая неделя', curr: kpis.lastWeekRevenue, prev: null },
        ].map(({ label, curr, prev }) => {
          const chg = prev !== null ? pctChange(curr, prev) : null
          const up = chg !== null && chg >= 0
          return (
            <div key={label} className="bg-[#0f172a] rounded-lg px-4 py-3 border border-[#1e293b] flex items-center justify-between">
              <span className="text-[11px] text-[#475569]">{label}</span>
              <div className="text-right">
                <span className="text-sm font-semibold text-[#cbd5e1]">₩{curr.toLocaleString()}</span>
                {chg !== null && (
                  <span className={`ml-2 text-[10px] ${up ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                    {up ? '↑' : '↓'}{Math.abs(chg)}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-5">
        <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
          <p className="text-[13px] font-medium text-[#94a3b8] mb-4">Продажи по дням (₩)</p>
          <SalesChart data={data.dailySales} showProfit={kpis.hasCostData} />
        </div>
        <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
          <p className="text-[13px] font-medium text-[#94a3b8] mb-4">По дням недели</p>
          <DowHeatmap data={data.dowSales} />
        </div>
      </div>

      {/* Product breakdown + inventory */}
      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-5">
        <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
          <p className="text-[13px] font-medium text-[#94a3b8] mb-5">Разбивка по товарам</p>
          <ProductBreakdown data={data.productBreakdown} />
        </div>
        <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
          <p className="text-[13px] font-medium text-[#94a3b8] mb-4">Склад</p>
          {data.inventory.length === 0
            ? <p className="text-[#475569] text-xs">Нет данных</p>
            : data.inventory.map(inv => (
              <InventoryBar key={inv.productId} productName={inv.productName} imageUrl={inv.imageUrl} quantity={inv.quantity} salesLast30Days={inv.salesLast30Days} />
            ))
          }
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
        <p className="text-[13px] font-medium text-[#94a3b8] mb-3">Последние заказы</p>
        <OrdersTable orders={data.recentOrders} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Visual check**

Open http://localhost:3000 — dashboard should show 2 large featured KPI cards (with top cyan line) above 3 smaller cards.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: restructure dashboard KPI layout to 2-featured + 3-secondary"
```

---

### Task 6: SalesChart — update colors

**Files:**
- Modify: `components/SalesChart.tsx`

- [ ] **Step 1: Update chart colors**

Change the three color values inside `SalesChart.tsx`:

1. Bar fill — line 32: `fill="#6366f1"` → `fill="#0ea5e9"`
2. Line stroke — line 37: `stroke="#10b981"` → `stroke="#22d3ee"`
3. Active dot fill — line 39: `fill: '#10b981'` → `fill: '#22d3ee'`
4. Tooltip background — line 17: `background: '#12141f'` → `background: '#0f172a'`
5. Tooltip border — line 17: `border: '1px solid #2d3148'` → `border: '1px solid #1e293b'`
6. Cursor fill — line 25: `fill: 'rgba(99,102,241,0.08)'` → `fill: 'rgba(14,165,233,0.08)'`

Final relevant lines in `components/SalesChart.tsx`:

```tsx
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, fontSize: 13 }}
          labelStyle={{ color: '#e2e8f0', marginBottom: 4 }}
          formatter={(v: number, name: string) => [
            `₩${Number(v).toLocaleString()}`,
            name === 'amount' ? 'Продажи' : 'Прибыль',
          ]}
          cursor={{ fill: 'rgba(14,165,233,0.08)' }}
        />
        ...
        <Bar dataKey="amount" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        {showProfit && (
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#22d3ee' }}
          />
        )}
```

- [ ] **Step 2: Commit**

```bash
git add components/SalesChart.tsx
git commit -m "style: update SalesChart colors to cyan palette"
```

---

### Task 7: DowHeatmap, InventoryBar, OrdersTable — update colors

**Files:**
- Modify: `components/DowHeatmap.tsx`
- Modify: `components/InventoryBar.tsx`
- Modify: `components/OrdersTable.tsx`

- [ ] **Step 1: Update DowHeatmap.tsx**

Change bar colors — replace two occurrences of `bg-[#6366f1]`:

```tsx
className={`w-full rounded-t-md transition-all ${isTop ? 'bg-[#0ea5e9]' : 'bg-[#0ea5e9]/30'}`}
```

Also update tooltip styles:
- `bg-[#12141f]` → `bg-[#0f172a]`
- `border-[#2d3148]` → `border-[#1e293b]`

- [ ] **Step 2: Update InventoryBar.tsx**

Replace old dark tokens with new palette:
- `bg-[#12141f]` (image container bg) → `bg-[#0f172a]`
- `border-[#2d3148]` (image container border) → `border-[#1e293b]`
- `text-[#3d4258]` (empty placeholder) → `text-[#1e293b]`
- `bg-[#2d3148]` (progress bar bg) → `bg-[#1e293b]`
- `text-[#9ca3af]` (ok quantity color) → `text-[#64748b]`
- `text-[#4b5563]` (sales sub-label) → `text-[#334155]`

- [ ] **Step 3: Update OrdersTable.tsx**

Replace old dark tokens:
- `border-[#2d3148]` (thead border) → `border-[#1e293b]`
- `hover:bg-[#1e2233]` → `hover:bg-[#0c1628]`
- `border-[#1e2233]` → `border-[#0f172a]`
- `bg-[#12141f]` (image cell bg) → `bg-[#0f172a]`
- `border-[#2d3148]` (image cell border) → `border-[#1e293b]`
- `text-[#3d4258]` (empty image) → `text-[#1e293b]`
- `text-[#4b5563]` (→ arrow) → `text-[#334155]`

- [ ] **Step 4: Visual check**

Open http://localhost:3000 — scroll to charts and tables. Bars should be cyan/blue, no purple remaining.

- [ ] **Step 5: Commit**

```bash
git add components/DowHeatmap.tsx components/InventoryBar.tsx components/OrdersTable.tsx
git commit -m "style: update remaining components to slate/cyan palette"
```
