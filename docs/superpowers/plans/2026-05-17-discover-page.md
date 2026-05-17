# Discover Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить страницу `/discover` с автоматическим ежедневным сканированием ниш через Naver + ручным ресёрчем любого товара с опциональным анализом фото через Claude Vision.

**Architecture:** Ежедневный крон сканирует 30 seed-ключей без сертификатов через Naver Ad/Shopping API, сохраняет результаты в SQLite. Страница показывает кэш сразу при открытии + форму для ручного ресёрча. Claude Haiku анализирует загруженное фото пользователя относительно результатов Naver Shopping.

**Tech Stack:** Next.js App Router, Prisma/SQLite, Naver Search Ad API, Naver Shopping API, Naver DataLab Search API, `@anthropic-ai/sdk` (claude-haiku-4-5-20251001), node-cron, Tailwind CSS

---

## File Map

| Файл | Действие | Что делает |
|------|----------|------------|
| `prisma/schema.prisma` | Modify | Добавить модель `NicheOpportunity` |
| `lib/naver/shopping.ts` | Create | `fetchShoppingResults`, `analyzePrices` |
| `lib/naver/searchad.ts` | Modify | Добавить `fetchRelatedKeywords` (возвращает список с `compIdx`) |
| `lib/naver/datalab.ts` | Modify | Добавить `fetchSearchTrends` (общий DataLab, без категории) |
| `lib/naver/research.ts` | Create | `SEED_KEYWORDS`, `quickResearch`, `runDailyScan`, `getVerdict` |
| `app/api/discover/route.ts` | Create | GET кэша, POST ручного ресёрча |
| `app/api/discover/scan/route.ts` | Create | POST для ручного запуска скана |
| `app/api/discover/match-image/route.ts` | Create | POST анализа фото через Claude |
| `instrumentation.ts` | Modify | Добавить ежедневный крон в 7:00 |
| `components/Sidebar.tsx` | Modify | Добавить ссылку `/discover` |
| `app/discover/page.tsx` | Create | Полная страница UI |

---

## Task 1: Install Anthropic SDK + Add Prisma Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Install @anthropic-ai/sdk**

```bash
cd C:\Users\PC\Desktop\cpng
npm install @anthropic-ai/sdk
```

Expected output: `added 1 package`

- [ ] **Step 2: Add NicheOpportunity model to schema.prisma**

В конец файла `prisma/schema.prisma` добавить:

```prisma
model NicheOpportunity {
  id           Int      @id @default(autoincrement())
  keyword      String
  volume       Int
  competition  String
  verdict      String
  trendChange  Int?
  medianPrice  Int?
  topKeywords  String
  scannedAt    DateTime @default(now())
}
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add_niche_opportunity
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Restart dev server**

Убить процесс `npm run dev` и запустить снова (Turbopack кэширует старый Prisma Client).

---

## Task 2: lib/naver/shopping.ts

**Files:**
- Create: `lib/naver/shopping.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/naver/shopping.ts

function naverHeaders() {
  return {
    'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
    'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
  }
}

export interface ShoppingItem {
  title: string
  link: string
  lprice: string
  mallName: string
  category1: string
}

export async function fetchShoppingResults(
  keyword: string,
  display = 20,
): Promise<ShoppingItem[]> {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${display}&sort=sim`
  const res = await fetch(url, { headers: naverHeaders() })
  if (!res.ok) return []
  const data = await res.json()
  return (data.items ?? []) as ShoppingItem[]
}

export interface PriceAnalysis {
  min: number
  max: number
  avg: number
  median: number
  count: number
}

export function analyzePrices(items: ShoppingItem[]): PriceAnalysis | null {
  const prices = items
    .map(i => parseInt(i.lprice))
    .filter(p => p > 0)
    .sort((a, b) => a - b)
  if (!prices.length) return null
  return {
    min: prices[0],
    max: prices[prices.length - 1],
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    median: prices[Math.floor(prices.length / 2)],
    count: prices.length,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/naver/shopping.ts
git commit -m "feat: add Naver Shopping API lib"
```

---

## Task 3: Extend lib/naver/searchad.ts — fetchRelatedKeywords

**Files:**
- Modify: `lib/naver/searchad.ts`

- [ ] **Step 1: Add RelatedKeyword type and fetchRelatedKeywords function**

В конец файла `lib/naver/searchad.ts` добавить:

```typescript
export interface RelatedKeyword {
  relKeyword: string
  monthlyPcQcCnt: number | '< 10'
  monthlyMobileQcCnt: number | '< 10'
  compIdx: string // '높음' | '중간' | '낮음'
  plAvgDepth: number
}

export function getVolume(k: RelatedKeyword): number {
  if (k.monthlyPcQcCnt === '< 10' || k.monthlyMobileQcCnt === '< 10') return 0
  return Number(k.monthlyPcQcCnt) + Number(k.monthlyMobileQcCnt)
}

export async function fetchRelatedKeywords(seed: string): Promise<RelatedKeyword[]> {
  const path = '/keywordstool'
  const qs = `hintKeywords=${encodeURIComponent(seed)}&showDetail=1`
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: adHeaders('GET', path),
  })
  if (!res.ok) return []
  const data = await res.json()
  const list: Array<{
    relKeyword: string
    monthlyPcQcCnt: number | string
    monthlyMobileQcCnt: number | string
    compIdx: string
    plAvgDepth: number
  }> = data.keywordList ?? []

  return list.map(item => ({
    relKeyword: item.relKeyword,
    monthlyPcQcCnt: item.monthlyPcQcCnt === '< 10' ? '< 10' : Number(item.monthlyPcQcCnt),
    monthlyMobileQcCnt: item.monthlyMobileQcCnt === '< 10' ? '< 10' : Number(item.monthlyMobileQcCnt),
    compIdx: item.compIdx ?? '높음',
    plAvgDepth: item.plAvgDepth ?? 0,
  }))
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/naver/searchad.ts
git commit -m "feat: add fetchRelatedKeywords with compIdx to searchad"
```

---

## Task 4: Extend lib/naver/datalab.ts — fetchSearchTrends

**Files:**
- Modify: `lib/naver/datalab.ts`

- [ ] **Step 1: Add fetchSearchTrends function**

В конец файла `lib/naver/datalab.ts` добавить:

```typescript
export interface SearchTrendPoint {
  period: string
  ratio: number
}

export async function fetchSearchTrends(keyword: string): Promise<SearchTrendPoint[] | null> {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 12)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate: fmt(start),
      endDate: fmt(end),
      timeUnit: 'month',
      keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return (data.results?.[0]?.data ?? null) as SearchTrendPoint[] | null
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/naver/datalab.ts
git commit -m "feat: add fetchSearchTrends to datalab lib"
```

---

## Task 5: lib/naver/research.ts

**Files:**
- Create: `lib/naver/research.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/naver/research.ts
import { fetchRelatedKeywords, getVolume, type RelatedKeyword } from './searchad'
import { fetchShoppingResults, analyzePrices } from './shopping'
import { fetchSearchTrends, type SearchTrendPoint } from './datalab'

// ── Seed keywords (no-cert categories) ───────────────────────────────────────

export const SEED_KEYWORDS = [
  // 수납/정리 (хранение)
  '수납함', '정리함', '서랍정리', '옷걸이', '행거',
  // 캠핑 (кемпинг)
  '캠핑의자', '캠핑테이블', '캠핑랜턴', '텐트팩', '캠핑매트',
  // 자동차용품 (автотовары)
  '차량용방향제', '차량수납', '트렁크정리', '주차번호판', '차량청소',
  // 홈오피스 (домашний офис)
  '모니터받침대', '키보드받침대', '케이블정리', '독서대', '마우스패드',
  // 스포츠 (спорт)
  '요가매트', '폼롤러', '줄넘기', '아령', '운동밴드',
  // 반려동물 (зоотовары)
  '강아지장난감', '고양이장난감', '펫빗', '강아지옷', '고양이터널',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function analyzeTrends(data: SearchTrendPoint[] | null): {
  change: number
  peak: number
  current: number
  months: number[]
} | null {
  if (!data || data.length < 4) return null
  const recent3 = data.slice(-3).map(d => d.ratio)
  const prev3 = data.slice(-6, -3).map(d => d.ratio)
  const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length
  const prevAvg = prev3.reduce((a, b) => a + b, 0) / prev3.length || 1
  return {
    change: Math.round(((recentAvg - prevAvg) / prevAvg) * 100),
    peak: Math.max(...data.map(d => d.ratio)),
    current: data[data.length - 1].ratio,
    months: data.map(d => d.ratio),
  }
}

function getVerdict(
  volume: number,
  comp: string,
  trends: ReturnType<typeof analyzeTrends>,
): { verdict: 'LAUNCH' | 'TEST' | 'AVOID'; reason: string } {
  if (volume > 50000 && comp === '높음')
    return { verdict: 'AVOID', reason: 'Огромный спрос, но рынок перегрет — очень высокая конкуренция' }
  if (volume > 50000 && comp === '중간')
    return { verdict: 'TEST', reason: 'Высокий спрос со средней конкуренцией — есть шанс при сильном листинге' }
  if (volume > 20000 && comp === '낮음')
    return { verdict: 'LAUNCH', reason: 'Хороший спрос при низкой конкуренции — отличная возможность' }
  if (volume > 10000 && comp !== '높음')
    return { verdict: 'TEST', reason: 'Умеренный спрос, конкуренция управляемая' }
  if (volume < 5000)
    return { verdict: 'AVOID', reason: 'Слишком низкий объём поиска — рынок слишком мал' }
  return { verdict: 'TEST', reason: 'Средний спрос — требует дополнительной проверки' }
}

function buildRisks(
  volume: number,
  comp: string,
  trends: ReturnType<typeof analyzeTrends>,
  prices: ReturnType<typeof analyzePrices>,
): string[] {
  const risks: string[] = []
  if (comp === '높음') risks.push('Высокая конкуренция — нужен уникальный листинг или нишевый вариант')
  if (trends && trends.current < trends.peak * 0.5) risks.push('Сезонный товар — сейчас не пик спроса')
  if (prices && prices.min < 5000) risks.push('Есть очень дешёвые конкуренты — ценовое давление снизу')
  if (volume > 100000) risks.push('Очень широкая ниша — сложно ранжироваться без рекламы')
  return risks
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ResearchResult {
  keyword: string
  volume: number
  competition: string
  verdict: 'LAUNCH' | 'TEST' | 'AVOID'
  verdictReason: string
  trendChange: number | null
  trendMonths: number[]
  medianPrice: number | null
  minPrice: number | null
  maxPrice: number | null
  topKeywords: Array<{ keyword: string; volume: number; competition: string }>
  competitors: Array<{ title: string; price: number; mall: string }>
  risks: string[]
}

// ── quickResearch ─────────────────────────────────────────────────────────────

export async function quickResearch(keyword: string): Promise<ResearchResult> {
  const [relatedKws, shoppingItems, rawTrends] = await Promise.all([
    fetchRelatedKeywords(keyword),
    fetchShoppingResults(keyword, 20),
    fetchSearchTrends(keyword),
  ])

  const main = relatedKws.find(k => k.relKeyword === keyword) ?? relatedKws[0]
  const volume = main ? getVolume(main) : 0
  const competition = main?.compIdx ?? '높음'
  const trends = analyzeTrends(rawTrends)
  const { verdict, reason } = getVerdict(volume, competition, trends)
  const prices = analyzePrices(shoppingItems)

  const topKeywords = relatedKws
    .filter(k => getVolume(k) > 300 && k.compIdx !== '높음')
    .sort((a, b) => getVolume(b) - getVolume(a))
    .slice(0, 5)
    .map(k => ({ keyword: k.relKeyword, volume: getVolume(k), competition: k.compIdx }))

  return {
    keyword,
    volume,
    competition,
    verdict,
    verdictReason: reason,
    trendChange: trends?.change ?? null,
    trendMonths: trends?.months ?? [],
    medianPrice: prices?.median ?? null,
    minPrice: prices?.min ?? null,
    maxPrice: prices?.max ?? null,
    topKeywords,
    competitors: shoppingItems.slice(0, 5).map(p => ({
      title: p.title.replace(/<[^>]+>/g, '').slice(0, 45),
      price: parseInt(p.lprice),
      mall: p.mallName,
    })),
    risks: buildRisks(volume, competition, trends, prices),
  }
}

// ── runDailyScan ──────────────────────────────────────────────────────────────

export async function runDailyScan(): Promise<void> {
  const { prisma } = await import('@/lib/db')

  // Clean up old results
  await prisma.nicheOpportunity.deleteMany({
    where: { scannedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  })
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  await prisma.nicheOpportunity.deleteMany({ where: { scannedAt: { gte: today } } })

  console.log(`[discover] Scanning ${SEED_KEYWORDS.length} keywords...`)

  for (const keyword of SEED_KEYWORDS) {
    try {
      const result = await quickResearch(keyword)
      if (result.verdict === 'AVOID') continue
      await prisma.nicheOpportunity.create({
        data: {
          keyword: result.keyword,
          volume: result.volume,
          competition: result.competition,
          verdict: result.verdict,
          trendChange: result.trendChange,
          medianPrice: result.medianPrice,
          topKeywords: JSON.stringify(result.topKeywords),
        },
      })
      console.log(`[discover] ${result.verdict === 'LAUNCH' ? '🟢' : '🟡'} ${keyword} (${result.volume.toLocaleString()}/мес)`)
    } catch (e) {
      console.error(`[discover] Failed: ${keyword}`, e)
    }
  }

  console.log('[discover] Daily scan complete')
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/naver/research.ts
git commit -m "feat: add naver research lib with quickResearch and daily scan"
```

---

## Task 6: API Routes — /api/discover

**Files:**
- Create: `app/api/discover/route.ts`
- Create: `app/api/discover/scan/route.ts`

- [ ] **Step 1: Create app/api/discover/route.ts**

```typescript
// app/api/discover/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { quickResearch } from '@/lib/naver/research'

export async function GET() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const results = await prisma.nicheOpportunity.findMany({
    where: { scannedAt: { gte: today } },
    orderBy: [{ verdict: 'asc' }, { volume: 'desc' }],
  })
  const lastScan = results[0]?.scannedAt ?? null
  return NextResponse.json({ results, lastScan })
}

export async function POST(req: NextRequest) {
  const { keyword } = await req.json()
  if (!keyword?.trim()) {
    return NextResponse.json({ error: 'keyword required' }, { status: 400 })
  }
  try {
    const result = await quickResearch(keyword.trim())
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create app/api/discover/scan/route.ts**

```typescript
// app/api/discover/scan/route.ts
import { NextResponse } from 'next/server'
import { runDailyScan } from '@/lib/naver/research'

export async function POST() {
  try {
    await runDailyScan()
    return NextResponse.json({ ok: true, scannedAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/discover/route.ts app/api/discover/scan/route.ts
git commit -m "feat: add /api/discover GET and POST routes"
```

---

## Task 7: API Route — /api/discover/match-image

**Files:**
- Create: `app/api/discover/match-image/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/discover/match-image/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { fetchShoppingResults } from '@/lib/naver/shopping'

export async function POST(req: NextRequest) {
  const { keyword, imageBase64, imageMediaType } = await req.json()
  if (!keyword || !imageBase64) {
    return NextResponse.json({ error: 'keyword and imageBase64 required' }, { status: 400 })
  }

  const products = await fetchShoppingResults(keyword, 5)
  const competitorTitles = products
    .map((p, i) => `${i + 1}. ${p.title.replace(/<[^>]+>/g, '')}`)
    .join('\n')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Ключевое слово поиска на Naver Shopping: "${keyword}"\n\nТоп товары в результатах:\n${competitorTitles}\n\nЭто фото товара, который хочу продавать:`,
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (imageMediaType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'Соответствует ли этот товар тому, что ищут по данному ключевому слову? Ответь строго в формате JSON без markdown: {"matches": true, "explanation": "1-2 предложения на русском"}',
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ matches: false, explanation: 'Не удалось проанализировать ответ' })
  }
  return NextResponse.json(JSON.parse(jsonMatch[0]))
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/discover/match-image/route.ts
git commit -m "feat: add match-image API route with Claude Vision"
```

---

## Task 8: instrumentation.ts — Daily Cron + Sidebar

**Files:**
- Modify: `instrumentation.ts`
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Add daily scan cron to instrumentation.ts**

Заменить содержимое `instrumentation.ts`:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cron = await import('node-cron')
    const { runSync } = await import('./lib/sync')
    const { runDailyScan } = await import('./lib/naver/research')

    cron.schedule('0 * * * *', () => {
      runSync()
    })

    cron.schedule('0 7 * * *', () => {
      runDailyScan()
    })

    console.log('[cron] Hourly sync + daily discover scheduler started')
  }
}
```

- [ ] **Step 2: Add /discover to Sidebar**

В файле `components/Sidebar.tsx` найти строку с импортами lucide-react и добавить `Compass`:

```typescript
import {
  LayoutGrid, List, Store, Image, Package,
  DollarSign, Undo2, Tag, MessageSquare, Search, TrendingUp, Settings2, Compass
} from 'lucide-react'
```

В массиве `NAV` добавить после `/trends`:

```typescript
{ href: '/discover', icon: Compass, label: 'Ниши' },
```

- [ ] **Step 3: Commit**

```bash
git add instrumentation.ts components/Sidebar.tsx
git commit -m "feat: add daily discover cron and sidebar link"
```

---

## Task 9: app/discover/page.tsx

**Files:**
- Create: `app/discover/page.tsx`

- [ ] **Step 1: Create the full page**

```typescript
// app/discover/page.tsx
'use client'
import { useEffect, useState, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Opportunity {
  id: number
  keyword: string
  volume: number
  competition: string
  verdict: string
  trendChange: number | null
  medianPrice: number | null
  topKeywords: string
}

interface ResearchResult {
  keyword: string
  volume: number
  competition: string
  verdict: string
  verdictReason: string
  trendChange: number | null
  trendMonths: number[]
  medianPrice: number | null
  minPrice: number | null
  maxPrice: number | null
  topKeywords: Array<{ keyword: string; volume: number; competition: string }>
  competitors: Array<{ title: string; price: number; mall: string }>
  risks: string[]
  imageMatch?: { matches: boolean; explanation: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function compLabel(c: string) {
  if (c === '높음') return 'Высокая'
  if (c === '중간') return 'Средняя'
  if (c === '낮음') return 'Низкая'
  return c
}

function compColor(c: string) {
  if (c === '높음') return 'text-red-400'
  if (c === '중간') return 'text-yellow-400'
  return 'text-green-400'
}

function verdictBadge(v: string) {
  if (v === 'LAUNCH') return { label: '🟢 ЗАПУСКАТЬ', cls: 'bg-green-400/10 text-green-400 border-green-400/30' }
  if (v === 'TEST') return { label: '🟡 ТЕСТИРОВАТЬ', cls: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' }
  return { label: '🔴 ИЗБЕГАТЬ', cls: 'bg-red-400/10 text-red-400 border-red-400/30' }
}

function trendLabel(change: number | null) {
  if (change === null) return null
  if (change > 15) return { text: `📈 +${change}%`, cls: 'text-green-400' }
  if (change < -15) return { text: `📉 ${change}%`, cls: 'text-red-400' }
  return { text: `➡️ ${change > 0 ? '+' : ''}${change}%`, cls: 'text-[#9ca3af]' }
}

function Sparkline({ months }: { months: number[] }) {
  if (months.length < 2) return null
  const max = Math.max(...months, 1)
  const w = 80
  const h = 24
  const pts = months
    .map((v, i) => `${(i / (months.length - 1)) * w},${h - (v / max) * (h - 2) + 1}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [loadingOpps, setLoadingOpps] = useState(true)
  const [scanning, setScanning] = useState(false)

  const [keyword, setKeyword] = useState('')
  const [researching, setResearching] = useState(false)
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [researchError, setResearchError] = useState<string | null>(null)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [matchingImage, setMatchingImage] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/discover')
      .then(r => r.json())
      .then(data => {
        setOpportunities(data.results ?? [])
        setLastScan(data.lastScan ?? null)
      })
      .finally(() => setLoadingOpps(false))
  }, [])

  async function handleScan() {
    setScanning(true)
    try {
      const res = await fetch('/api/discover/scan', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        const fresh = await fetch('/api/discover').then(r => r.json())
        setOpportunities(fresh.results ?? [])
        setLastScan(fresh.lastScan ?? null)
      }
    } finally {
      setScanning(false)
    }
  }

  async function handleResearch() {
    if (!keyword.trim()) return
    setResearching(true)
    setResult(null)
    setResearchError(null)
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim() }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)

      if (imageFile) {
        setMatchingImage(true)
        const base64 = await fileToBase64(imageFile)
        const matchRes = await fetch('/api/discover/match-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: keyword.trim(),
            imageBase64: base64,
            imageMediaType: imageFile.type,
          }),
        })
        const matchData = await matchRes.json()
        setResult(prev => prev ? { ...prev, imageMatch: matchData } : prev)
        setMatchingImage(false)
      }
    } catch (e) {
      setResearchError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setResearching(false)
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function handleFileChange(file: File | null) {
    if (!file) return
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setImagePreview(url)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleFileChange(file)
  }, [])

  const badge = (v: string) => verdictBadge(v)

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Ниши</h1>
          <p className="text-xs text-[#6b7280] mt-0.5">
            {lastScan
              ? `Последний скан: ${new Date(lastScan).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'Скан ещё не запускался'}
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a1d2e] border border-[#2d3148] hover:border-[#6366f1] text-sm text-[#9ca3af] hover:text-white rounded-xl transition-colors disabled:opacity-50"
        >
          <span className={scanning ? 'animate-spin inline-block' : ''}>↻</span>
          {scanning ? 'Сканирование...' : 'Обновить сейчас'}
        </button>
      </div>

      {/* ── Auto-discovered results ── */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-[#6b7280] uppercase tracking-wider mb-3">Находки сегодня</h2>

        {loadingOpps ? (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-36 rounded-xl bg-[#1a1d2e] border border-[#2d3148] animate-pulse" />
            ))}
          </div>
        ) : opportunities.length === 0 ? (
          <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-8 text-center">
            <div className="text-3xl mb-3">🔍</div>
            <p className="text-sm text-[#6b7280] mb-4">Скан ещё не запускался. Нажми "Обновить сейчас" — займёт ~2 минуты.</p>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-4 py-2 bg-[#6366f1] hover:bg-[#818cf8] text-white text-sm rounded-xl transition-colors disabled:opacity-50"
            >
              {scanning ? 'Сканирование...' : 'Запустить первый скан'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {opportunities.map(opp => {
              const b = badge(opp.verdict)
              const trend = trendLabel(opp.trendChange)
              const topKws: Array<{ keyword: string; volume: number }> = JSON.parse(opp.topKeywords || '[]')
              return (
                <div key={opp.id} className="bg-[#1a1d2e] border border-[#2d3148] hover:border-[#374151] rounded-xl p-4 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-sm font-medium text-white leading-snug">{opp.keyword}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${b.cls}`}>{b.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs mb-3">
                    <div>
                      <span className="text-[#4b5563]">Объём </span>
                      <span className="text-white">{opp.volume.toLocaleString('ru-RU')}/мес</span>
                    </div>
                    <div>
                      <span className="text-[#4b5563]">Конкур. </span>
                      <span className={compColor(opp.competition)}>{compLabel(opp.competition)}</span>
                    </div>
                    {trend && (
                      <div>
                        <span className={`text-xs ${trend.cls}`}>{trend.text}</span>
                      </div>
                    )}
                    {opp.medianPrice && (
                      <div>
                        <span className="text-[#4b5563]">Медиана </span>
                        <span className="text-white">{opp.medianPrice.toLocaleString('ru-RU')}₩</span>
                      </div>
                    )}
                  </div>
                  {topKws.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {topKws.slice(0, 3).map(k => (
                        <span key={k.keyword} className="text-[10px] px-1.5 py-0.5 bg-[#12141f] border border-[#2d3148] rounded text-[#6b7280]">
                          {k.keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Manual research ── */}
      <div>
        <h2 className="text-sm font-medium text-[#6b7280] uppercase tracking-wider mb-3">Проверить товар</h2>

        <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-5 mb-4">
          <div className="flex gap-3 mb-4">
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !researching && handleResearch()}
              placeholder="Ключевое слово (по-корейски, например: 수납함)"
              className="flex-1 bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#4b5563] outline-none transition-colors"
            />
            <button
              onClick={handleResearch}
              disabled={researching || !keyword.trim()}
              className="px-5 py-2.5 bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white text-sm rounded-xl transition-colors"
            >
              {researching ? 'Анализ...' : 'Исследовать'}
            </button>
          </div>

          {/* Image upload */}
          <div
            ref={dropRef}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="border border-dashed border-[#2d3148] hover:border-[#6366f1] rounded-xl p-4 cursor-pointer transition-colors flex items-center gap-4"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="preview" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                <div className="text-sm text-[#9ca3af]">
                  <span className="text-white">{imageFile?.name}</span>
                  <br />
                  <span className="text-xs text-[#4b5563]">Нажми чтобы заменить • Claude проверит соответствие ключевому слову</span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null) }}
                  className="ml-auto text-[#4b5563] hover:text-white text-lg"
                >×</button>
              </>
            ) : (
              <div className="text-sm text-[#4b5563] text-center w-full">
                📷 Загрузи фото товара (опционально) — Claude проверит соответствие запросу
              </div>
            )}
          </div>
        </div>

        {researchError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-3 text-red-400 text-sm mb-4">
            {researchError}
          </div>
        )}

        {/* Research result */}
        {result && (
          <div className="space-y-4">
            {/* Verdict */}
            <div className={`rounded-xl border p-5 ${
              result.verdict === 'LAUNCH' ? 'bg-green-400/5 border-green-400/20' :
              result.verdict === 'TEST' ? 'bg-yellow-400/5 border-yellow-400/20' :
              'bg-red-400/5 border-red-400/20'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className={`text-lg font-bold mb-1 ${
                    result.verdict === 'LAUNCH' ? 'text-green-400' :
                    result.verdict === 'TEST' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {badge(result.verdict).label}
                  </div>
                  <p className="text-sm text-[#9ca3af]">{result.verdictReason}</p>
                </div>
                {result.trendMonths.length > 0 && (
                  <div className="flex-shrink-0 pt-1">
                    <Sparkline months={result.trendMonths} />
                    {result.trendChange !== null && (
                      <div className={`text-[10px] text-center mt-1 ${trendLabel(result.trendChange)?.cls}`}>
                        {trendLabel(result.trendChange)?.text}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-[#12141f] rounded-lg p-3 text-center">
                  <div className="text-xs text-[#4b5563] mb-1">Объём поиска</div>
                  <div className="text-sm font-medium">{result.volume.toLocaleString('ru-RU')}/мес</div>
                </div>
                <div className="bg-[#12141f] rounded-lg p-3 text-center">
                  <div className="text-xs text-[#4b5563] mb-1">Конкуренция</div>
                  <div className={`text-sm font-medium ${compColor(result.competition)}`}>{compLabel(result.competition)}</div>
                </div>
                <div className="bg-[#12141f] rounded-lg p-3 text-center">
                  <div className="text-xs text-[#4b5563] mb-1">Медиана цен</div>
                  <div className="text-sm font-medium">{result.medianPrice ? `${result.medianPrice.toLocaleString('ru-RU')}₩` : '—'}</div>
                </div>
              </div>
            </div>

            {/* Image match */}
            {(result.imageMatch || matchingImage) && (
              <div className={`rounded-xl border p-4 ${
                matchingImage ? 'bg-[#1a1d2e] border-[#2d3148]' :
                result.imageMatch?.matches ? 'bg-green-400/5 border-green-400/20' : 'bg-orange-400/5 border-orange-400/20'
              }`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl">{matchingImage ? '🔍' : result.imageMatch?.matches ? '✅' : '⚠️'}</span>
                  <div>
                    <div className="text-sm font-medium mb-0.5">
                      {matchingImage ? 'Claude анализирует фото...' :
                        result.imageMatch?.matches ? 'Товар соответствует запросу' : 'Товар может не соответствовать'}
                    </div>
                    {result.imageMatch?.explanation && (
                      <p className="text-xs text-[#9ca3af]">{result.imageMatch.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Prices */}
              {(result.minPrice || result.maxPrice) && (
                <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Цены конкурентов</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#4b5563]">Мин</span>
                      <span>{result.minPrice?.toLocaleString('ru-RU')}₩</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#4b5563]">Медиана</span>
                      <span className="font-medium">{result.medianPrice?.toLocaleString('ru-RU')}₩</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#4b5563]">Макс</span>
                      <span>{result.maxPrice?.toLocaleString('ru-RU')}₩</span>
                    </div>
                  </div>
                  {result.competitors.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#2d3148] space-y-1.5">
                      {result.competitors.map((c, i) => (
                        <div key={i} className="flex justify-between gap-2 text-xs">
                          <span className="text-[#6b7280] truncate">{c.title}</span>
                          <span className="flex-shrink-0">{c.price.toLocaleString('ru-RU')}₩</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Top keywords */}
              {result.topKeywords.length > 0 && (
                <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Ключи для листинга</h3>
                  <div className="space-y-2">
                    {result.topKeywords.map((k, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-white">{k.keyword}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[#4b5563]">{k.volume.toLocaleString('ru-RU')}/мес</span>
                          <span className={`text-[10px] ${compColor(k.competition)}`}>{compLabel(k.competition)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Risks */}
            {result.risks.length > 0 && (
              <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Риски</h3>
                <ul className="space-y-1.5">
                  {result.risks.map((r, i) => (
                    <li key={i} className="text-sm text-[#9ca3af] flex gap-2">
                      <span className="text-yellow-400 flex-shrink-0">⚠️</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify dev server shows the page correctly**

Открыть http://localhost:3000/discover — должна быть страница с заголовком "Ниши", кнопкой "Обновить сейчас", пустым состоянием и формой ресёрча внизу.

- [ ] **Step 3: Test manual research**

Ввести `수납함` в поле, нажать "Исследовать" — через ~5 сек должен появиться вердикт с данными.

- [ ] **Step 4: Test scan**

Нажать "Обновить сейчас" — должно появиться "Сканирование..." и через ~2 минуты карточки с находками.

- [ ] **Step 5: Commit**

```bash
git add app/discover/page.tsx
git commit -m "feat: add /discover page with auto-scan results and manual research"
```

---

## Self-Review

**Spec coverage:**
- ✅ Ежедневный крон в 7:00 — Task 8
- ✅ 30 seed ключей по 6 категориям без сертификатов — Task 5
- ✅ Сохранение в БД, чистка через 7 дней — Task 5
- ✅ GET /api/discover — кэш за сегодня — Task 6
- ✅ POST /api/discover — ручной ресёрч — Task 6
- ✅ POST /api/discover/scan — ручной запуск — Task 6
- ✅ POST /api/discover/match-image — Claude Vision — Task 7
- ✅ Карточки с вердиктом 🟢/🟡, объёмом, конкуренцией, трендом, ценой, ключами — Task 9
- ✅ Форма ручного ресёрча с drag-and-drop фото — Task 9
- ✅ Спарклайн тренда SVG — Task 9
- ✅ Блок рисков — Task 9
- ✅ Sidebar ссылка — Task 8

**Placeholder scan:** Нет TBD/TODO — все шаги содержат реальный код.

**Type consistency:** `ResearchResult` определён в `lib/naver/research.ts` и используется в API-роутах и странице одинаково. `Opportunity` на странице соответствует Prisma модели `NicheOpportunity`.
