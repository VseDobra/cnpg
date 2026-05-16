# /trends Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/trends` page that fetches keyword demand data from Naver DataLab Shopping Insight API and displays trend charts + top-500 category keywords linked to the user's Coupang products.

**Architecture:** Naver API calls are proxied through two Next.js API routes (`/api/trends/keywords` and `/api/trends/top`) that hold an in-memory 24h cache. The page is a client component that loads product list from the DB, lazily fetches Coupang `searchTags` per product on demand, and renders a recharts `LineChart` plus a searchable top-500 table. A new `naverCategoryId` field is added to the `Product` model and exposed in the existing product editor.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma/SQLite, Tailwind (dark theme), recharts (already installed)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/naver/datalab.ts` | Typed wrappers for Naver API calls |
| Create | `app/api/trends/keywords/route.ts` | Proxy + cache for keyword trend endpoint |
| Create | `app/api/trends/top/route.ts` | Proxy + cache for top-500 endpoint |
| Create | `app/trends/page.tsx` | Full page UI |
| Modify | `prisma/schema.prisma` | Add `naverCategoryId String?` to Product |
| Modify | `app/api/products/[id]/cost/route.ts` | Include `naverCategoryId` in GET/PATCH |
| Modify | `app/products/[id]/page.tsx` | Add Naver category ID input field |
| Modify | `components/Sidebar.tsx` | Add `/trends` nav item |

---

## Task 1: Prisma schema — add naverCategoryId

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add field to Product model**

In `prisma/schema.prisma`, add one line to the `Product` model after `imageUrl`:

```prisma
model Product {
  id        String   @id
  name      String
  status    String
  salePrice Int
  costPrice      Int      @default(0)
  couponDiscount Int      @default(0)
  commission     Float    @default(10.8)
  adRate         Float    @default(5.0)
  taxRate        Float    @default(10.0)
  rgDelivery     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  imageUrl  String?
  naverCategoryId String?
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_naver_category_id
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 4: Kill dev server and restart**

Stop the running `npm run dev` process (Ctrl+C), then:

```bash
npm run dev
```

This is required — Turbopack caches the old Prisma client.

---

## Task 2: Naver DataLab API wrappers

**Files:**
- Create: `lib/naver/datalab.ts`

- [ ] **Step 1: Create the file**

Create `lib/naver/datalab.ts` with this content:

```typescript
const BASE = 'https://openapi.naver.com/v1/datalab/shopping'

function naverHeaders() {
  return {
    'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
    'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
    'Content-Type': 'application/json',
  }
}

export interface KeywordTrendPoint {
  period: string
  ratio: number
}

export interface KeywordTrendResult {
  title: string
  data: KeywordTrendPoint[]
}

export interface KeywordTrendsResponse {
  startDate: string
  endDate: string
  timeUnit: string
  results: KeywordTrendResult[]
}

export async function fetchKeywordTrends(params: {
  startDate: string
  endDate: string
  timeUnit: 'date' | 'week' | 'month'
  category: string
  keyword: Array<{ name: string; param: string[] }>
}): Promise<KeywordTrendsResponse> {
  const res = await fetch(`${BASE}/category/keywords`, {
    method: 'POST',
    headers: naverHeaders(),
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = Object.assign(new Error(`Naver API ${res.status}`), { status: res.status })
    throw err
  }
  return res.json()
}

export interface TopKeywordEntry {
  keyword: string
  ratio: number
}

export interface TopKeywordsResponse {
  startDate: string
  endDate: string
  timeUnit: string
  results: Array<{
    title: string
    data: TopKeywordEntry[]
  }>
}

export async function fetchTopKeywords(params: {
  startDate: string
  endDate: string
  timeUnit: 'date' | 'week' | 'month'
  category: string
}): Promise<TopKeywordsResponse> {
  const res = await fetch(`${BASE}/category/keyword/ratio`, {
    method: 'POST',
    headers: naverHeaders(),
    body: JSON.stringify({
      startDate: params.startDate,
      endDate: params.endDate,
      timeUnit: params.timeUnit,
      category: [{ name: 'category', param: [params.category] }],
    }),
  })
  if (!res.ok) {
    const err = Object.assign(new Error(`Naver API ${res.status}`), { status: res.status })
    throw err
  }
  return res.json()
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/naver/datalab.ts
git commit -m "feat: add Naver DataLab API wrappers"
```

---

## Task 3: API route — keyword trends proxy

**Files:**
- Create: `app/api/trends/keywords/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { fetchKeywordTrends, type KeywordTrendsResponse } from '@/lib/naver/datalab'

const cache = new Map<string, { data: KeywordTrendsResponse; expiresAt: number }>()
const TTL = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Добавь NAVER_CLIENT_ID и NAVER_CLIENT_SECRET в .env.local' },
      { status: 503 },
    )
  }

  const body = await req.json()
  const { startDate, endDate, timeUnit, category, keyword } = body

  const cacheKey = `kw|${category}|${(keyword as Array<{name:string}>).map(k => k.name).join(',')}|${startDate}|${endDate}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  try {
    const data = await fetchKeywordTrends({ startDate, endDate, timeUnit, category, keyword })
    cache.set(cacheKey, { data, expiresAt: Date.now() + TTL })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const status = (e as { status?: number }).status
    if (status === 429 && cached) {
      return NextResponse.json({ ...cached.data, rateLimited: true })
    }
    return NextResponse.json({ error: String(e) }, { status: status ?? 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/trends/keywords/route.ts
git commit -m "feat: add /api/trends/keywords proxy route"
```

---

## Task 4: API route — top keywords proxy

**Files:**
- Create: `app/api/trends/top/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { fetchTopKeywords, type TopKeywordsResponse } from '@/lib/naver/datalab'

const cache = new Map<string, { data: TopKeywordsResponse; expiresAt: number }>()
const TTL = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Добавь NAVER_CLIENT_ID и NAVER_CLIENT_SECRET в .env.local' },
      { status: 503 },
    )
  }

  const body = await req.json()
  const { startDate, endDate, timeUnit, category } = body

  const cacheKey = `top|${category}|${startDate}|${endDate}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  try {
    const data = await fetchTopKeywords({ startDate, endDate, timeUnit, category })
    cache.set(cacheKey, { data, expiresAt: Date.now() + TTL })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const status = (e as { status?: number }).status
    if (status === 429 && cached) {
      return NextResponse.json({ ...cached.data, rateLimited: true })
    }
    return NextResponse.json({ error: String(e) }, { status: status ?? 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/trends/top/route.ts
git commit -m "feat: add /api/trends/top proxy route"
```

---

## Task 5: naverCategoryId in cost route + product editor

**Files:**
- Modify: `app/api/products/[id]/cost/route.ts`
- Modify: `app/products/[id]/page.tsx`

### 5a — Update cost route

- [ ] **Step 1: Update GET to include naverCategoryId**

In `app/api/products/[id]/cost/route.ts`, update the `select` in GET:

```typescript
const product = await prisma.product.findUnique({
  where: { id },
  select: {
    costPrice: true, couponDiscount: true, commission: true,
    adRate: true, taxRate: true, rgDelivery: true,
    naverCategoryId: true,
  },
})
```

- [ ] **Step 2: Update PATCH to accept naverCategoryId**

Replace the PATCH handler body with:

```typescript
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: Record<string, number | string | null> = {}
  if (typeof body.costPrice === 'number' && body.costPrice >= 0) data.costPrice = body.costPrice
  if (typeof body.couponDiscount === 'number' && body.couponDiscount >= 0) data.couponDiscount = body.couponDiscount
  if (typeof body.commission === 'number' && body.commission >= 0) data.commission = body.commission
  if (typeof body.adRate === 'number' && body.adRate >= 0) data.adRate = body.adRate
  if (typeof body.taxRate === 'number' && body.taxRate >= 0) data.taxRate = body.taxRate
  if (typeof body.rgDelivery === 'number' && body.rgDelivery >= 0) data.rgDelivery = body.rgDelivery
  if ('naverCategoryId' in body) data.naverCategoryId = body.naverCategoryId || null
  const product = await prisma.product.update({ where: { id }, data })
  return NextResponse.json(product)
}
```

### 5b — Add naverCategoryId field in product editor

- [ ] **Step 3: Add state variable in ProductEditPage**

In `app/products/[id]/page.tsx`, add a new state variable near the other cost-related state (around line 138):

```typescript
const [naverCategoryId, setNaverCategoryId] = useState('')
const [naverCategorySaving, setNaverCategorySaving] = useState(false)
const [naverCategoryMsg, setNaverCategoryMsg] = useState<string | null>(null)
```

- [ ] **Step 4: Load naverCategoryId in useEffect**

In the existing `useEffect` that fetches `/api/products/${id}/cost`, add after the existing `setRgDeliveryStr(...)` line:

```typescript
if (d.naverCategoryId) setNaverCategoryId(d.naverCategoryId)
```

- [ ] **Step 5: Add save handler**

After the existing `saveCostPrice` function, add:

```typescript
async function saveNaverCategoryId() {
  setNaverCategorySaving(true)
  setNaverCategoryMsg(null)
  const res = await fetch(`/api/products/${id}/cost`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ naverCategoryId }),
  })
  setNaverCategorySaving(false)
  setNaverCategoryMsg(res.ok ? 'Сохранено' : 'Ошибка')
  setTimeout(() => setNaverCategoryMsg(null), 2000)
}
```

- [ ] **Step 6: Add UI field**

In the cost-price Section (the one that contains "Себестоимость", "Скидка купонами" etc.), add a new Field after the last existing field in that section:

```tsx
<Field label="Naver категория ID">
  <div className="flex gap-2">
    <Input
      value={naverCategoryId}
      onChange={setNaverCategoryId}
      placeholder="50000167"
    />
    <button
      onClick={saveNaverCategoryId}
      disabled={naverCategorySaving}
      className="px-3 py-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 rounded-lg text-xs text-white transition-colors whitespace-nowrap"
    >
      {naverCategorySaving ? '...' : 'Сохранить'}
    </button>
  </div>
  {naverCategoryMsg && (
    <p className="text-[11px] mt-1 text-green-400">{naverCategoryMsg}</p>
  )}
</Field>
```

- [ ] **Step 7: Commit**

```bash
git add app/api/products/[id]/cost/route.ts app/products/[id]/page.tsx
git commit -m "feat: add naverCategoryId field to product editor"
```

---

## Task 6: /trends page

**Files:**
- Create: `app/trends/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/trends/page.tsx`:

```tsx
'use client'
import { useEffect, useState, KeyboardEvent } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

interface DbProduct {
  id: string
  name: string
  imageUrl: string | null
  naverCategoryId: string | null
}

interface TrendPoint {
  period: string
  [keyword: string]: number | string
}

interface TopKeyword {
  keyword: string
  ratio: number
}

const PERIODS = [
  { label: '30д',  days: 30,  timeUnit: 'week'  as const },
  { label: '90д',  days: 90,  timeUnit: 'week'  as const },
  { label: '180д', days: 180, timeUnit: 'week'  as const },
  { label: '365д', days: 365, timeUnit: 'month' as const },
]

const LINE_COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e']
const MAX_KEYWORDS = 5

function getPeriodDates(days: number) {
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
}

function buildChartData(
  results: Array<{ title: string; data: Array<{ period: string; ratio: number }> }>,
): TrendPoint[] {
  const map = new Map<string, TrendPoint>()
  for (const result of results) {
    for (const point of result.data) {
      if (!map.has(point.period)) map.set(point.period, { period: point.period.slice(5) })
      map.get(point.period)![result.title] = point.ratio
    }
  }
  return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period))
}

export default function TrendsPage() {
  const [products, setProducts] = useState<DbProduct[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [period, setPeriod] = useState(PERIODS[1])
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)
  const [topKeywords, setTopKeywords] = useState<TopKeyword[]>([])
  const [topLoading, setTopLoading] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)
  const [topSearch, setTopSearch] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [loadingTags, setLoadingTags] = useState<Record<string, boolean>>({})
  const [missingCreds, setMissingCreds] = useState(false)

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(setProducts)
  }, [])

  useEffect(() => {
    if (keywords.length === 0) {
      setTrendData([])
      return
    }
    const { startDate, endDate } = getPeriodDates(period.days)
    setTrendLoading(true)
    setTrendError(null)
    setRateLimited(false)

    // Use first active category — required by Naver API
    const category = activeCategoryId ?? '50000167'

    fetch('/api/trends/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: period.timeUnit,
        category,
        keyword: keywords.map(k => ({ name: k, param: [k] })),
      }),
    })
      .then(r => {
        if (r.status === 503) { setMissingCreds(true); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        if (data.rateLimited) setRateLimited(true)
        if (data.results) setTrendData(buildChartData(data.results))
        else if (data.error) setTrendError(data.error)
      })
      .catch(() => setTrendError('Ошибка сети'))
      .finally(() => setTrendLoading(false))
  }, [keywords, period, activeCategoryId])

  useEffect(() => {
    if (!activeCategoryId) return
    const { startDate, endDate } = getPeriodDates(period.days)
    setTopLoading(true)
    setTopError(null)

    fetch('/api/trends/top', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: period.timeUnit,
        category: activeCategoryId,
      }),
    })
      .then(r => {
        if (r.status === 503) { setMissingCreds(true); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        if (data.results?.[0]?.data) {
          setTopKeywords(data.results[0].data)
        } else if (data.error) {
          setTopError(data.error)
        }
      })
      .catch(() => setTopError('Ошибка сети'))
      .finally(() => setTopLoading(false))
  }, [activeCategoryId, period])

  async function handleAddProduct(product: DbProduct) {
    if (loadingTags[product.id]) return
    setLoadingTags(prev => ({ ...prev, [product.id]: true }))
    try {
      const res = await fetch(`/api/products/${product.id}`)
      const data = await res.json()
      const tags: string[] = data.searchTags ?? []
      const toAdd = tags.filter(t => !keywords.includes(t))
      const newKeywords = [...keywords, ...toAdd].slice(0, MAX_KEYWORDS)
      setKeywords(newKeywords)
      if (product.naverCategoryId && !activeCategoryId) {
        setActiveCategoryId(product.naverCategoryId)
      }
    } finally {
      setLoadingTags(prev => ({ ...prev, [product.id]: false }))
    }
  }

  function addKeyword(kw: string) {
    const trimmed = kw.trim()
    if (!trimmed || keywords.includes(trimmed) || keywords.length >= MAX_KEYWORDS) return
    setKeywords(prev => [...prev, trimmed])
  }

  function removeKeyword(kw: string) {
    setKeywords(prev => prev.filter(k => k !== kw))
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      addKeyword(inputValue)
      setInputValue('')
    }
  }

  const filteredTop = topKeywords.filter(k =>
    !topSearch || k.keyword.toLowerCase().includes(topSearch.toLowerCase())
  )

  return (
    <div>
      {missingCreds && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          Добавь <code className="font-mono bg-red-500/10 px-1 rounded">NAVER_CLIENT_ID</code> и{' '}
          <code className="font-mono bg-red-500/10 px-1 rounded">NAVER_CLIENT_SECRET</code> в{' '}
          <code className="font-mono bg-red-500/10 px-1 rounded">.env.local</code>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold">Тренды Naver Shopping</h1>
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button
              key={p.label}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md border text-xs transition-colors ${
                period.label === p.label
                  ? 'bg-[#1e2a4a] text-blue-400 border-blue-400'
                  : 'bg-[#1a1d2e] text-[#9ca3af] border-[#2d3148] hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product list + keyword pills */}
      <div className="grid grid-cols-[220px_1fr] gap-4 mb-4">
        <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] p-4">
          <p className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Товары</p>
          <div className="flex flex-col gap-2">
            {products.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                  )}
                  <span className="text-xs text-[#e2e8f0] truncate">{p.name}</span>
                </div>
                <button
                  onClick={() => handleAddProduct(p)}
                  disabled={!p.naverCategoryId || loadingTags[p.id] || keywords.length >= MAX_KEYWORDS}
                  title={!p.naverCategoryId ? 'Укажи Naver-категорию в настройках товара' : undefined}
                  className="flex-shrink-0 w-6 h-6 rounded-md bg-[#6366f1]/20 hover:bg-[#6366f1]/40 disabled:opacity-30 disabled:cursor-not-allowed text-blue-400 text-sm font-bold transition-colors"
                >
                  {loadingTags[p.id] ? '…' : '+'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] p-4">
          <p className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">
            Ключевые слова <span className="text-[#4b5563]">({keywords.length}/{MAX_KEYWORDS})</span>
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            {keywords.map((kw, i) => (
              <span
                key={kw}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border"
                style={{ borderColor: LINE_COLORS[i % LINE_COLORS.length] + '60', color: LINE_COLORS[i % LINE_COLORS.length], background: LINE_COLORS[i % LINE_COLORS.length] + '15' }}
              >
                {kw}
                <button onClick={() => removeKeyword(kw)} className="opacity-60 hover:opacity-100 text-[10px] leading-none">×</button>
              </span>
            ))}
            {keywords.length < MAX_KEYWORDS && (
              <input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="+ добавить слово, Enter"
                className="bg-transparent border border-dashed border-[#2d3148] focus:border-[#6366f1] rounded-full px-3 py-1 text-xs text-[#9ca3af] placeholder-[#4b5563] outline-none transition-colors min-w-[180px]"
              />
            )}
          </div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-semibold">Динамика кликов (индекс 0–100)</p>
          {rateLimited && (
            <span className="text-[11px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
              Rate limit — показаны кэшированные данные
            </span>
          )}
        </div>

        {trendLoading ? (
          <div className="h-[280px] flex items-center justify-center">
            <div className="flex flex-col gap-2 w-full px-4">
              {[100, 70, 90, 50, 80].map((w, i) => (
                <div key={i} className="h-4 rounded bg-[#2d3148] animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        ) : trendError ? (
          <div className="h-[280px] flex items-center justify-center text-[#6b7280] text-sm">{trendError}</div>
        ) : keywords.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-[#4b5563] text-sm">
            Выбери товар или добавь ключевые слова
          </div>
        ) : trendData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-[#6b7280] text-sm">
            Нет данных за выбранный период
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={6} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{ background: '#12141f', border: '1px solid #2d3148', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: '#e2e8f0', marginBottom: 4 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: 8 }} />
              {keywords.map((kw, i) => (
                <Line
                  key={kw}
                  type="monotone"
                  dataKey={kw}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top-500 keywords */}
      {activeCategoryId && (
        <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-semibold">Топ слов категории</p>
            <input
              value={topSearch}
              onChange={e => setTopSearch(e.target.value)}
              placeholder="Поиск по таблице..."
              className="bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-1.5 text-xs text-white outline-none transition-colors w-48"
            />
          </div>

          {topLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 rounded bg-[#2d3148] animate-pulse" />
              ))}
            </div>
          ) : topError ? (
            <p className="text-[#6b7280] text-sm">{topError}</p>
          ) : filteredTop.length === 0 ? (
            <p className="text-[#4b5563] text-sm">Нет данных</p>
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-[#6b7280] uppercase tracking-wider">
                    <th className="text-left pb-2 w-10">#</th>
                    <th className="text-left pb-2">Слово</th>
                    <th className="text-right pb-2 w-24">Доля (%)</th>
                    <th className="pb-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filteredTop.map((item, i) => (
                    <tr key={item.keyword} className="border-t border-[#2d3148] hover:bg-[#12141f] transition-colors">
                      <td className="py-2 text-[#4b5563] text-xs">{i + 1}</td>
                      <td className="py-2 font-medium">{item.keyword}</td>
                      <td className="py-2 text-right text-[#9ca3af]">{item.ratio.toFixed(2)}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => addKeyword(item.keyword)}
                          disabled={keywords.includes(item.keyword) || keywords.length >= MAX_KEYWORDS}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-[#6366f1]/20 hover:bg-[#6366f1]/40 text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          + в график
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/trends/page.tsx
git commit -m "feat: add /trends page with Naver DataLab integration"
```

---

## Task 7: Sidebar nav item

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Add /trends to NAV array**

In `components/Sidebar.tsx`, add to the `NAV` array after the `/research` entry:

```typescript
{ href: '/trends', icon: '📈', label: 'Тренды' },
```

- [ ] **Step 2: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add Тренды to sidebar navigation"
```

---

## Task 8: Add Naver API keys to .env.local

- [ ] **Step 1: Register on Naver developers portal**

Go to https://developers.naver.com/main/, register an application, enable **데이터랩(쇼핑인사이트)** API.

- [ ] **Step 2: Add keys to .env.local**

Add to `.env.local`:

```
NAVER_CLIENT_ID=your_client_id_here
NAVER_CLIENT_SECRET=your_client_secret_here
```

- [ ] **Step 3: Restart dev server**

```bash
# Stop running server, then:
npm run dev
```

- [ ] **Step 4: Set naverCategoryId on each product**

Open each product at `/products/[id]`, scroll to the cost section, enter the Naver shopping category ID (e.g. `50000167` for camping). Save.

Common Naver shopping category IDs to look up at https://datalab.naver.com/shoppingInsight/sCategory.naver:
- Find your product's category in the DataLab UI, note the `cid` parameter in the URL.

- [ ] **Step 5: Test the page**

Open http://localhost:3000/trends, click `[+]` next to a product, verify the chart renders.

---

## Self-Review Notes

- All 7 spec requirements covered: hybrid keyword sourcing ✓, period switcher ✓, trend chart ✓, top-500 table ✓, in-memory cache ✓, error states ✓, naverCategoryId in product editor ✓
- `buildChartData` correctly merges multi-keyword results into recharts format
- Top keywords table only renders when `activeCategoryId` is set — avoids empty requests
- `handleAddProduct` fetches Coupang tags lazily on click, not on page load (only 2 products, acceptable)
- `naverCategoryId` defaults to `'50000167'` in keyword fetch when no category is active — this fallback means the chart works even before categories are set, though top-500 will stay hidden
