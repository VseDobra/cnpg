'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { computeVerdict, extractCategoryBucket, type Verdict } from '@/lib/explorer/verdict'

interface RunDetail {
  id: string
  keyword: string
  scrapedAt: string
  verdictLevel: string
  verdictText: string
  metrics: Record<string, number | string>
  reasons: string[]
  sheetTabs: string[]
  reviewCount: number
  productCount: number
  searchVolume: SearchVolumeSummary | null
  aiExtended: ExtendedAnalysis | null
  products: ProductRow[]
  reviews: ReviewRow[]
  questions: QuestionRow[]
  tags: TagRow[]
  topics: TopicRow[]
}

interface SearchVolumeSummary {
  seedKeyword: string
  seedMonthlyTotal: number
  seedCompetition: string
  seedAdDepth: number
  relatedCount: number
  totalEcosystemSearches: number
  relatedTopN: KeywordStat[]
}

interface KeywordStat {
  keyword: string
  monthlyPc: number
  monthlyMobile: number
  monthlyTotal: number
  avgPcClicks: number
  avgMobileClicks: number
  ctrPc: number
  ctrMobile: number
  adDepth: number
  competition: string
  isSeed: boolean
}

interface ExtendedAnalysis {
  positiveDrivers: { driver: string; importance: string; evidence: string; mentions: number }[]
  improvementAreas: { area: string; severity: string; evidence: string; opportunity: string; mentions: number }[]
  expectationEvolution: { expectation: string; reality: string; gap: string; mentions: number }[]
  demographics: { segment: string; share: string; signals: string[]; needs: string[] }[]
  priceTiers: { tier: string; priceRange: string; buyerProfile: string; sentimentTone: string; mentions: number }[]
  strategicInsights: { opportunity: string; rationale: string; priority: string }[]
}

interface ProductRow {
  productId: string
  name: string
  price: number
  originalPrice: number
  discountPct: number
  couponDiscount: number
  rating: number
  reviewCount: number
  imageCount: number
  firstImage: string
  category: string
  url: string
  seller: string
  isRocket: boolean
  isWow: boolean
  recentBuyers: number | null
  searchRank: number | null
}
interface ReviewRow {
  id: string
  productId: string
  productName: string
  reviewId: string
  rating: number
  reviewedAt: string
  reviewer: string
  helpful: number
  title: string
  content: string
  photos: string[]
}
interface QuestionRow {
  id: string
  productId: string
  question: string
  answer: string
  askedAt: string | null
  answeredAt: string | null
}
interface TagRow {
  id: string
  productId: string
  tag: string
  count: number
}
interface TopicRow {
  id: string
  kind: 'pain' | 'positive' | 'fear' | string
  topic: string
  count: number
  quotes: string[]
  reviewIds: string[]
  rank: number
}

type TabKey = 'overview' | 'demand' | 'strategy' | 'reviews' | 'photos' | 'qa' | 'products' | 'tags'

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [run, setRun] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')
  const [topicFilter, setTopicFilter] = useState<TopicRow | null>(null)
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)
  const [productFilter, setProductFilter] = useState<string | null>(null)
  const [withPhotosOnly, setWithPhotosOnly] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/explorer/runs/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then((d: RunDetail) => setRun(d))
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [id])

  // Hooks must be called before any early return — guards inside

  // === Уровень 1: срез по категории (если выбрана) ===
  const categoryBuckets = useMemo(() => {
    if (!run) return [] as { name: string; count: number }[]
    const m = new Map<string, number>()
    for (const p of run.products) {
      const b = extractCategoryBucket(p.category)
      m.set(b, (m.get(b) ?? 0) + 1)
    }
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }, [run])

  const categoryProducts = useMemo(() => {
    if (!run) return [] as ProductRow[]
    if (!categoryFilter) return run.products
    return run.products.filter((p) => extractCategoryBucket(p.category) === categoryFilter)
  }, [run, categoryFilter])

  const categoryProductIds = useMemo(
    () => new Set(categoryProducts.map((p) => p.productId)),
    [categoryProducts],
  )

  const categoryReviews = useMemo(() => {
    if (!run) return [] as ReviewRow[]
    if (!categoryFilter) return run.reviews
    return run.reviews.filter((r) => categoryProductIds.has(r.productId))
  }, [run, categoryFilter, categoryProductIds])

  const categoryQuestions = useMemo(() => {
    if (!run) return [] as QuestionRow[]
    if (!categoryFilter) return run.questions
    return run.questions.filter((q) => categoryProductIds.has(q.productId))
  }, [run, categoryFilter, categoryProductIds])

  const categoryTags = useMemo(() => {
    if (!run) return [] as TagRow[]
    if (!categoryFilter) return run.tags
    return run.tags.filter((t) => categoryProductIds.has(t.productId))
  }, [run, categoryFilter, categoryProductIds])

  const categoryTopics = useMemo(() => {
    if (!run) return [] as TopicRow[]
    if (!categoryFilter) return run.topics
    const allowedReviewIds = new Set(categoryReviews.map((r) => r.reviewId))
    return run.topics
      .map((t) => {
        const filteredIds = t.reviewIds.filter((rid) => allowedReviewIds.has(rid))
        return { ...t, reviewIds: filteredIds, count: filteredIds.length }
      })
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [run, categoryFilter, categoryReviews])

  // === Уровень 2: остальные фильтры применяются поверх ===
  const filteredReviews = useMemo(() => {
    let rs = categoryReviews
    if (topicFilter) {
      const allow = new Set(topicFilter.reviewIds)
      if (allow.size) rs = rs.filter((r) => allow.has(r.reviewId))
    }
    if (ratingFilter != null) rs = rs.filter((r) => r.rating === ratingFilter)
    if (productFilter) rs = rs.filter((r) => r.productId === productFilter)
    if (withPhotosOnly) rs = rs.filter((r) => r.photos.length > 0)
    return rs
  }, [categoryReviews, topicFilter, ratingFilter, productFilter, withPhotosOnly])

  const ratingDist = useMemo(() => {
    const d = [0, 0, 0, 0, 0]
    for (const r of categoryReviews) {
      const k = Math.max(1, Math.min(5, Math.round(r.rating)))
      d[k - 1]++
    }
    return d
  }, [categoryReviews])

  // === Вердикт пересчитан под выбранную категорию ===
  const dynamicVerdict: Verdict | null = useMemo(() => {
    if (!run || !categoryFilter) return null
    return computeVerdict(categoryProducts, categoryReviews)
  }, [run, categoryFilter, categoryProducts, categoryReviews])

  if (loading) return <div className="min-h-screen bg-slate-950 text-slate-300 p-8">Загрузка...</div>
  if (error) return <div className="min-h-screen bg-slate-950 text-red-400 p-8">Ошибка: {error}</div>
  if (!run) return <div className="min-h-screen bg-slate-950 text-slate-300 p-8">Прогон не найден</div>

  const pains = categoryTopics.filter((t) => t.kind === 'pain')
  const positives = categoryTopics.filter((t) => t.kind === 'positive')
  const fears = categoryTopics.filter((t) => t.kind === 'fear')
  const reviewsWithPhotos = categoryReviews.filter((r) => r.photos && r.photos.length > 0)
  const allPhotos = reviewsWithPhotos.flatMap((r) => r.photos.map((url) => ({ url, review: r })))
  const productMap = new Map(run.products.map((p) => [p.productId, p]))

  const effectiveVerdictLevel = dynamicVerdict?.level ?? run.verdictLevel
  const effectiveVerdictText = dynamicVerdict?.text ?? run.verdictText
  const effectiveMetrics = dynamicVerdict?.metrics ?? run.metrics
  const effectiveReasons = dynamicVerdict?.reasons ?? run.reasons

  const verdictColor =
    effectiveVerdictLevel === 'GO' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
    : effectiveVerdictLevel === 'MAYBE' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
    : 'bg-red-500/15 text-red-300 border-red-500/40'

  const clearFilters = () => {
    setTopicFilter(null)
    setRatingFilter(null)
    setProductFilter(null)
    setWithPhotosOnly(false)
  }
  const hasFilters = topicFilter || ratingFilter != null || productFilter || withPhotosOnly
  const hasExtended = !!run.aiExtended
  const hasDemand = !!run.searchVolume

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/40 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4 mb-3">
            <Link href="/explorer" className="text-cyan-400 hover:text-cyan-300 text-sm">← Все прогоны</Link>
            <span className="text-slate-600">•</span>
            <h1 className="text-xl font-bold flex-1">{run.keyword || 'Без названия'}</h1>
            <span className="text-xs text-slate-500">
              {new Date(run.scrapedAt).toLocaleString('ru-RU')}
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <span className={`px-3 py-1 rounded-full border text-xs font-semibold ${verdictColor}`}>
              {effectiveVerdictText}
              {categoryFilter && <span className="ml-1.5 opacity-60">· {categoryFilter}</span>}
            </span>
            <Stat label="Листингов" value={categoryProducts.length} total={categoryFilter ? run.productCount : undefined} />
            <Stat label="Отзывов" value={categoryReviews.length} total={categoryFilter ? run.reviewCount : undefined} />
            <Stat label="С фото" value={reviewsWithPhotos.length} />
            <Stat label="Вопросов" value={categoryQuestions.length} total={categoryFilter ? run.questions.length : undefined} />
            <Stat label="Хэштегов" value={categoryTags.length} total={categoryFilter ? run.tags.length : undefined} />
            {hasDemand && (
              <Stat label="Naver/мес" value={run.searchVolume!.seedMonthlyTotal.toLocaleString()} />
            )}
          </div>

          {categoryBuckets.length > 1 && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Категория:</span>
              <button
                onClick={() => setCategoryFilter(null)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  !categoryFilter
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                все <span className="opacity-60">({run.products.length})</span>
              </button>
              {categoryBuckets.map((b) => {
                const active = categoryFilter === b.name
                return (
                  <button
                    key={b.name}
                    onClick={() => setCategoryFilter(active ? null : b.name)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-slate-100 hover:border-slate-600'
                    }`}
                    title={`Только товары из «${b.name}» (${b.count} шт.)`}
                  >
                    {b.name} <span className="opacity-60">({b.count})</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex gap-1 mt-4 -mb-px flex-wrap">
            <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Обзор</TabBtn>
            {hasDemand && (
              <TabBtn active={tab === 'demand'} onClick={() => setTab('demand')}>
                Спрос <span className="opacity-60">({run.searchVolume!.relatedCount + 1})</span>
              </TabBtn>
            )}
            {hasExtended && (
              <TabBtn active={tab === 'strategy'} onClick={() => setTab('strategy')}>Стратегия</TabBtn>
            )}
            <TabBtn active={tab === 'reviews'} onClick={() => setTab('reviews')}>
              Отзывы <span className="opacity-60">({filteredReviews.length}/{categoryReviews.length})</span>
            </TabBtn>
            <TabBtn active={tab === 'photos'} onClick={() => setTab('photos')}>
              Фото <span className="opacity-60">({allPhotos.length})</span>
            </TabBtn>
            <TabBtn active={tab === 'qa'} onClick={() => setTab('qa')}>
              Q&A <span className="opacity-60">({categoryQuestions.length})</span>
            </TabBtn>
            <TabBtn active={tab === 'products'} onClick={() => setTab('products')}>
              Товары <span className="opacity-60">({categoryProducts.length})</span>
            </TabBtn>
            <TabBtn active={tab === 'tags'} onClick={() => setTab('tags')}>
              Хэштеги <span className="opacity-60">({categoryTags.length})</span>
            </TabBtn>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'overview' && (
          <OverviewTab
            run={run}
            pains={pains}
            positives={positives}
            fears={fears}
            ratingDist={ratingDist}
            verdictText={effectiveVerdictText}
            metrics={effectiveMetrics}
            reasons={effectiveReasons}
            categoryFilter={categoryFilter}
            onPickTopic={(t) => {
              setTopicFilter(t)
              setTab('reviews')
            }}
          />
        )}

        {tab === 'demand' && hasDemand && <DemandTab sv={run.searchVolume!} />}
        {tab === 'strategy' && hasExtended && (
          <StrategyTab ext={run.aiExtended!} categoryFilter={categoryFilter} />
        )}

        {tab === 'reviews' && (
          <div className="grid grid-cols-[260px_1fr] gap-6">
            <aside className="space-y-4">
              <FilterSidebar
                pains={pains}
                positives={positives}
                products={categoryProducts}
                topicFilter={topicFilter}
                ratingFilter={ratingFilter}
                productFilter={productFilter}
                withPhotosOnly={withPhotosOnly}
                ratingDist={ratingDist}
                onTopic={setTopicFilter}
                onRating={setRatingFilter}
                onProduct={setProductFilter}
                onWithPhotos={setWithPhotosOnly}
                onClear={clearFilters}
                hasFilters={!!hasFilters}
              />
            </aside>
            <main>
              <ReviewList reviews={filteredReviews} productMap={productMap} />
            </main>
          </div>
        )}

        {tab === 'photos' && <PhotoGallery photos={allPhotos} productMap={productMap} />}
        {tab === 'qa' && <QATab questions={categoryQuestions} fears={fears} productMap={productMap} />}
        {tab === 'products' && <ProductsTab products={categoryProducts} reviews={categoryReviews} />}
        {tab === 'tags' && <TagsTab tags={categoryTags} productMap={productMap} />}
      </div>
    </div>
  )
}

// ============ Subcomponents ============

function Stat({ label, value, total }: { label: string; value: number | string; total?: number | string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-slate-500 text-xs">{label}:</span>
      <span className="text-slate-100 font-semibold tabular-nums">
        {value}
        {total != null && total !== value && <span className="text-slate-500 font-normal">/{total}</span>}
      </span>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 transition-colors ${
        active
          ? 'border-cyan-500 text-cyan-300'
          : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function OverviewTab({
  run, pains, positives, fears, ratingDist, verdictText, metrics, reasons, categoryFilter, onPickTopic,
}: {
  run: RunDetail
  pains: TopicRow[]
  positives: TopicRow[]
  fears: TopicRow[]
  ratingDist: number[]
  verdictText: string
  metrics: Record<string, number | string>
  reasons: string[]
  categoryFilter: string | null
  onPickTopic: (t: TopicRow) => void
}) {
  const total = ratingDist.reduce((s, n) => s + n, 0) || 1
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        {categoryFilter && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-4 py-3 text-sm text-cyan-200 flex items-center gap-2">
            <span className="text-base">📂</span>
            <span>
              Срез по категории «<strong>{categoryFilter}</strong>». Вердикт {verdictText.replace(/^[🟢🟡🔴]\s*/u, '')} пересчитан по подвыборке.
            </span>
          </div>
        )}

        {run.searchVolume && (
          <Card title="Спрос на Naver" subtitle="реальный объём поиска по ключевику" accent="cyan">
            <div className="grid grid-cols-4 gap-4 mb-2">
              <BigMetric label="Запросов/мес (seed)" value={run.searchVolume.seedMonthlyTotal.toLocaleString()} />
              <BigMetric label="Конкуренция" value={competitionLabel(run.searchVolume.seedCompetition)} />
              <BigMetric label="Глубина рекламы" value={`${run.searchVolume.seedAdDepth}/10`} />
              <BigMetric label="Связанных ключей" value={run.searchVolume.relatedCount.toString()} />
            </div>
            <p className="text-xs text-slate-500">
              Суммарный спрос всей экосистемы: <strong className="text-slate-300">{run.searchVolume.totalEcosystemSearches.toLocaleString()}</strong> запросов/мес.
              Подробности в вкладке «Спрос».
            </p>
          </Card>
        )}

        <Card title="Боль клиентов" subtitle="клик → отзывы с этой темой" accent="red">
          {pains.length === 0 ? (
            <Empty>AI ещё не размечал. Нужен повторный прогон с ≥10 отзывами.</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pains.map((t) => (
                <TopicChip key={t.id} topic={t} variant="pain" onClick={() => onPickTopic(t)} />
              ))}
            </div>
          )}
        </Card>

        <Card title="Что хвалят" subtitle="клик → отзывы" accent="green">
          {positives.length === 0 ? (
            <Empty>AI ещё не размечал.</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {positives.map((t) => (
                <TopicChip key={t.id} topic={t} variant="positive" onClick={() => onPickTopic(t)} />
              ))}
            </div>
          )}
        </Card>

        {fears.length > 0 && (
          <Card title="Страхи до покупки" subtitle="из Q&A — что сомневаются покупатели" accent="amber">
            <div className="space-y-2">
              {fears.map((f) => (
                <div key={f.id} className="bg-slate-900 rounded-lg px-4 py-3">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-medium text-slate-100">{f.topic}</span>
                    <span className="text-xs text-amber-300">×{f.count}</span>
                  </div>
                  {f.quotes.length > 0 && (
                    <ul className="text-xs text-slate-400 space-y-0.5">
                      {f.quotes.slice(0, 3).map((q, i) => <li key={i}>· {q}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {run.aiExtended && run.aiExtended.strategicInsights.length > 0 && (
          <Card title="Стратегия (AI)" subtitle="что делать новому продавцу — клик «Стратегия» для деталей" accent="cyan">
            <ul className="space-y-2 text-sm">
              {run.aiExtended.strategicInsights.slice(0, 3).map((s, i) => (
                <li key={i} className="flex gap-2">
                  <PriorityBadge priority={s.priority} />
                  <span className="text-slate-200">{s.opportunity}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Обоснование вердикта">
          <ul className="space-y-1 text-sm text-slate-300">
            {reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="Метрики">
          <dl className="space-y-2 text-sm">
            {Object.entries(metrics).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-slate-800/60 pb-1.5">
                <dt className="text-slate-400 text-xs">{labelMetric(k)}</dt>
                <dd className="font-semibold tabular-nums">{formatMetric(k, v)}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Распределение ★">
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const c = ratingDist[star - 1]
              const pct = (c / total) * 100
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-slate-400">{star}★</span>
                  <div className="flex-1 bg-slate-800 rounded h-3 overflow-hidden">
                    <div
                      className={`h-full ${
                        star >= 4 ? 'bg-emerald-500' : star === 3 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="tabular-nums w-12 text-right text-slate-500">{c} ({pct.toFixed(0)}%)</span>
                </div>
              )
            })}
          </div>
        </Card>

        {run.sheetTabs.length > 0 && (
          <Card title="Google Sheets табы">
            <ul className="space-y-1 text-xs font-mono text-slate-400">
              {run.sheetTabs.map((t) => <li key={t}>· {t}</li>)}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}

function DemandTab({ sv }: { sv: SearchVolumeSummary }) {
  const allRows: KeywordStat[] = [
    {
      keyword: sv.seedKeyword,
      monthlyPc: 0,
      monthlyMobile: 0,
      monthlyTotal: sv.seedMonthlyTotal,
      avgPcClicks: 0,
      avgMobileClicks: 0,
      ctrPc: 0,
      ctrMobile: 0,
      adDepth: sv.seedAdDepth,
      competition: sv.seedCompetition,
      isSeed: true,
    },
    ...sv.relatedTopN,
  ]
  const maxTotal = Math.max(...allRows.map((r) => r.monthlyTotal), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Спрос seed/мес" value={sv.seedMonthlyTotal.toLocaleString()} sub={`конкуренция: ${competitionLabel(sv.seedCompetition)}`} />
        <SummaryCard label="Реклама seed" value={`${sv.seedAdDepth}/10`} sub="глубина показа рекламы" />
        <SummaryCard label="Связанных ключей" value={sv.relatedCount.toString()} sub="Naver выдал родственников" />
        <SummaryCard label="Экосистема" value={sv.totalEcosystemSearches.toLocaleString()} sub="запросов/мес во всех связанных" />
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-xs uppercase text-slate-400 tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Ключевик</th>
              <th className="text-right px-4 py-3">PC</th>
              <th className="text-right px-4 py-3">Mobile</th>
              <th className="text-right px-4 py-3">Всего/мес</th>
              <th className="text-right px-4 py-3">Спрос</th>
              <th className="text-right px-4 py-3">CTR PC %</th>
              <th className="text-right px-4 py-3">CTR mob %</th>
              <th className="text-right px-4 py-3">Реклама</th>
              <th className="text-center px-4 py-3">Конкур.</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => {
              const pct = (r.monthlyTotal / maxTotal) * 100
              return (
                <tr key={r.keyword} className={`border-t border-slate-800 ${r.isSeed ? 'bg-cyan-500/5' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.isSeed && <span className="text-[10px] bg-cyan-500/30 text-cyan-200 px-1.5 rounded">SEED</span>}
                      <span className={r.isSeed ? 'font-semibold text-cyan-200' : 'text-slate-200'}>{r.keyword}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{r.monthlyPc === -1 ? '<10' : r.monthlyPc.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{r.monthlyMobile === -1 ? '<10' : r.monthlyMobile.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-100">{r.monthlyTotal.toLocaleString()}</td>
                  <td className="px-4 py-2.5 w-32">
                    <div className="bg-slate-800 h-2 rounded overflow-hidden">
                      <div
                        className={`h-full ${r.isSeed ? 'bg-cyan-500' : 'bg-slate-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{r.ctrPc.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{r.ctrMobile.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{r.adDepth}</td>
                  <td className="px-4 py-2.5 text-center">
                    <CompetitionPill level={r.competition} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StrategyTab({ ext, categoryFilter }: { ext: ExtendedAnalysis; categoryFilter: string | null }) {
  return (
    <div className="space-y-6">
      {categoryFilter && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-200">
          ⚠️ AI-разбор посчитан по <strong>всей выборке</strong>, а не по подкатегории «{categoryFilter}». Для пересчёта нужен новый прогон.
        </div>
      )}

      {ext.strategicInsights.length > 0 && (
        <Card title="Стратегические инсайты" subtitle="что конкретно делать новому продавцу" accent="cyan">
          <div className="space-y-3">
            {ext.strategicInsights.map((s, i) => (
              <div key={i} className="bg-slate-900 rounded-lg p-4 flex gap-3 items-start">
                <PriorityBadge priority={s.priority} />
                <div className="flex-1">
                  <p className="text-slate-100 font-medium">{s.opportunity}</p>
                  <p className="text-xs text-slate-400 mt-1">{s.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6">
        {ext.positiveDrivers.length > 0 && (
          <Card title="Драйверы покупки" subtitle="что реально приводит к покупке" accent="green">
            <div className="space-y-2">
              {ext.positiveDrivers.map((d, i) => (
                <div key={i} className="bg-slate-900 rounded p-3">
                  <div className="flex items-baseline gap-2 mb-1">
                    <ImportanceBadge importance={d.importance} />
                    <span className="font-medium text-slate-100 flex-1">{d.driver}</span>
                    <span className="text-xs text-slate-500">×{d.mentions}</span>
                  </div>
                  <p className="text-xs text-slate-400">{d.evidence}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {ext.improvementAreas.length > 0 && (
          <Card title="Зоны для отстройки" subtitle="где конкуренты слабы — атакуй здесь" accent="red">
            <div className="space-y-2">
              {ext.improvementAreas.map((a, i) => (
                <div key={i} className="bg-slate-900 rounded p-3">
                  <div className="flex items-baseline gap-2 mb-1">
                    <SeverityBadge severity={a.severity} />
                    <span className="font-medium text-slate-100 flex-1">{a.area}</span>
                    <span className="text-xs text-slate-500">×{a.mentions}</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-1.5">{a.evidence}</p>
                  <p className="text-xs text-emerald-300 italic">↳ {a.opportunity}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {ext.expectationEvolution.length > 0 && (
        <Card title="Ожидание vs реальность" subtitle="где gap между обещаниями и опытом" accent="amber">
          <div className="grid grid-cols-2 gap-3">
            {ext.expectationEvolution.map((e, i) => (
              <div key={i} className="bg-slate-900 rounded p-3 border-l-4 border-l-amber-500/40">
                <div className="flex justify-between items-baseline mb-2">
                  <GapBadge gap={e.gap} />
                  <span className="text-xs text-slate-500">×{e.mentions}</span>
                </div>
                <div className="text-xs text-slate-400 mb-1">
                  <span className="text-slate-500">Ждали:</span> {e.expectation}
                </div>
                <div className="text-xs text-slate-300">
                  <span className="text-slate-500">Получили:</span> {e.reality}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {ext.demographics.length > 0 && (
        <Card title="Сегменты покупателей" subtitle="кто покупает и зачем" accent="cyan">
          <div className="grid grid-cols-2 gap-3">
            {ext.demographics.map((d, i) => (
              <div key={i} className="bg-slate-900 rounded p-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-semibold text-slate-100">{d.segment}</span>
                  <ShareBadge share={d.share} />
                </div>
                {d.signals.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Сигналы</div>
                    <ul className="text-xs text-slate-400 space-y-0.5">
                      {d.signals.slice(0, 4).map((s, j) => <li key={j}>· {s}</li>)}
                    </ul>
                  </div>
                )}
                {d.needs.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Что им важно</div>
                    <div className="flex flex-wrap gap-1">
                      {d.needs.map((n, j) => (
                        <span key={j} className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {ext.priceTiers.length > 0 && (
        <Card title="Ценовые полки" subtitle="как покупатели воспринимают разные цены">
          <div className="grid grid-cols-3 gap-3">
            {ext.priceTiers.map((p, i) => (
              <div key={i} className="bg-slate-900 rounded-lg p-4 border-t-2 border-t-cyan-500/40">
                <div className="flex items-baseline gap-2 mb-2">
                  <TierBadge tier={p.tier} />
                  <span className="text-xs text-slate-500 ml-auto">×{p.mentions}</span>
                </div>
                <div className="text-lg font-bold text-slate-100 mb-1">{p.priceRange}</div>
                <p className="text-xs text-slate-400 mb-2">{p.buyerProfile}</p>
                <p className="text-xs text-slate-500 italic">«{p.sentimentTone}»</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ============ Existing tabs (unchanged) ============

function FilterSidebar(props: {
  pains: TopicRow[]
  positives: TopicRow[]
  products: ProductRow[]
  topicFilter: TopicRow | null
  ratingFilter: number | null
  productFilter: string | null
  withPhotosOnly: boolean
  ratingDist: number[]
  onTopic: (t: TopicRow | null) => void
  onRating: (r: number | null) => void
  onProduct: (p: string | null) => void
  onWithPhotos: (v: boolean) => void
  onClear: () => void
  hasFilters: boolean
}) {
  return (
    <div className="space-y-5 sticky top-32">
      {props.hasFilters && (
        <button
          onClick={props.onClear}
          className="w-full bg-slate-800 hover:bg-slate-700 text-xs py-2 rounded-lg text-slate-300 transition-colors"
        >
          ✕ Сбросить фильтры
        </button>
      )}

      <div>
        <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Боли</h3>
        <div className="space-y-1">
          {props.pains.map((t) => {
            const active = props.topicFilter?.id === t.id
            return (
              <button
                key={t.id}
                onClick={() => props.onTopic(active ? null : t)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                  active ? 'bg-red-500/20 text-red-200' : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="text-red-400 mr-1">×{t.count}</span>
                {t.topic}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Похвалы</h3>
        <div className="space-y-1">
          {props.positives.map((t) => {
            const active = props.topicFilter?.id === t.id
            return (
              <button
                key={t.id}
                onClick={() => props.onTopic(active ? null : t)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                  active ? 'bg-emerald-500/20 text-emerald-200' : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="text-emerald-400 mr-1">×{t.count}</span>
                {t.topic}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Рейтинг</h3>
        <div className="flex flex-wrap gap-1">
          {[5, 4, 3, 2, 1].map((s) => {
            const active = props.ratingFilter === s
            return (
              <button
                key={s}
                onClick={() => props.onRating(active ? null : s)}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                  active ? 'bg-cyan-500/25 text-cyan-200' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {s}★ <span className="opacity-50">({props.ratingDist[s - 1]})</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={props.withPhotosOnly}
            onChange={(e) => props.onWithPhotos(e.target.checked)}
            className="accent-cyan-500"
          />
          Только с фото
        </label>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Товар</h3>
        <select
          value={props.productFilter ?? ''}
          onChange={(e) => props.onProduct(e.target.value || null)}
          className="w-full bg-slate-800 text-xs rounded px-2 py-1.5 text-slate-200"
        >
          <option value="">— все —</option>
          {props.products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.name.slice(0, 50)}{p.name.length > 50 ? '…' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ReviewList({ reviews, productMap }: { reviews: ReviewRow[]; productMap: Map<string, ProductRow> }) {
  if (reviews.length === 0) return <Empty>Нет отзывов под фильтр.</Empty>
  return (
    <div className="space-y-3">
      {reviews.slice(0, 200).map((r) => {
        const p = productMap.get(r.productId)
        return (
          <div key={r.id} className="bg-slate-900 rounded-lg p-4">
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <Stars rating={r.rating} />
              <span className="text-xs text-slate-500">{r.reviewedAt}</span>
              <span className="text-xs text-slate-500">helpful: {r.helpful}</span>
              <span className="text-xs text-slate-500">{r.reviewer}</span>
              {p && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener"
                  className="text-xs text-cyan-400 hover:text-cyan-300 ml-auto truncate max-w-md"
                  title={p.name}
                >
                  → {p.name.slice(0, 60)}
                </a>
              )}
            </div>
            {r.title && <div className="font-medium text-slate-100 mb-1">{r.title}</div>}
            <div className="text-sm text-slate-300 whitespace-pre-wrap">{r.content}</div>
            {r.photos.length > 0 && (
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {r.photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-20 w-20 object-cover rounded border border-slate-800 hover:border-cyan-500 transition-colors" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {reviews.length > 200 && (
        <div className="text-center text-xs text-slate-500 py-4">
          показано 200 из {reviews.length}
        </div>
      )}
    </div>
  )
}

function PhotoGallery({
  photos, productMap,
}: { photos: { url: string; review: ReviewRow }[]; productMap: Map<string, ProductRow> }) {
  if (photos.length === 0) return <Empty>Нет фото в отзывах.</Empty>
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      {photos.map(({ url, review }, i) => {
        const p = productMap.get(review.productId)
        return (
          <a key={i} href={url} target="_blank" rel="noopener" className="group block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="w-full aspect-square object-cover rounded-lg border border-slate-800 group-hover:border-cyan-500 transition-colors"
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500">
              <Stars rating={review.rating} small />
              <span className="truncate" title={p?.name}>{p?.name.slice(0, 28) ?? ''}</span>
            </div>
          </a>
        )
      })}
    </div>
  )
}

function QATab({
  questions, fears, productMap,
}: { questions: QuestionRow[]; fears: TopicRow[]; productMap: Map<string, ProductRow> }) {
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-3">
        {questions.length === 0 ? (
          <Empty>Q&A не собрано. Скрипт пробует три endpoints — возможно, ни один не сработал. Проверь /next-api/inquiries в DevTools.</Empty>
        ) : (
          questions.map((q) => {
            const p = productMap.get(q.productId)
            return (
              <div key={q.id} className="bg-slate-900 rounded-lg p-4">
                <div className="flex items-baseline gap-3 mb-2 text-xs text-slate-500">
                  {q.askedAt && <span>{q.askedAt}</span>}
                  {p && <span className="truncate ml-auto max-w-md" title={p.name}>{p.name.slice(0, 40)}</span>}
                </div>
                <div className="text-sm">
                  <div className="text-slate-200 mb-2">
                    <span className="text-cyan-400 font-bold mr-2">Q:</span>
                    {q.question}
                  </div>
                  {q.answer && (
                    <div className="text-slate-400 pl-5 border-l-2 border-slate-700">
                      <span className="text-slate-500 font-bold mr-2">A:</span>
                      {q.answer}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
      <div>
        <Card title="Страхи (AI)">
          {fears.length === 0 ? (
            <Empty>AI ещё не размечал.</Empty>
          ) : (
            <div className="space-y-2">
              {fears.map((f) => (
                <div key={f.id} className="text-sm">
                  <div className="font-medium text-amber-300">×{f.count} {f.topic}</div>
                  {f.quotes.slice(0, 2).map((q, i) => (
                    <div key={i} className="text-xs text-slate-500 mt-0.5">· {q}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function ProductsTab({ products, reviews }: { products: ProductRow[]; reviews: ReviewRow[] }) {
  const reviewsByProduct = useMemo(() => {
    const map = new Map<string, ReviewRow[]>()
    for (const r of reviews) {
      if (!map.has(r.productId)) map.set(r.productId, [])
      map.get(r.productId)!.push(r)
    }
    return map
  }, [reviews])

  if (products.length === 0) {
    return <Empty>В этой категории нет товаров.</Empty>
  }

  return (
    <div className="space-y-3">
      {products.map((p) => {
        const rs = reviewsByProduct.get(p.productId) ?? []
        const dist = [0, 0, 0, 0, 0]
        for (const r of rs) {
          const k = Math.max(1, Math.min(5, Math.round(r.rating)))
          dist[k - 1]++
        }
        const total = dist.reduce((s, n) => s + n, 0) || 1
        return (
          <div key={p.productId} className="bg-slate-900 rounded-lg p-4 flex gap-4">
            {p.firstImage && (
              <a href={p.url} target="_blank" rel="noopener" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.firstImage} alt="" className="w-24 h-24 object-cover rounded border border-slate-800" />
              </a>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                {p.searchRank && (
                  <span className="text-xs bg-slate-800 text-slate-400 rounded px-1.5 py-0.5 tabular-nums">
                    #{p.searchRank}
                  </span>
                )}
                <a href={p.url} target="_blank" rel="noopener" className="font-medium text-slate-100 hover:text-cyan-300 truncate">
                  {p.name}
                </a>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 mb-2">
                <span className="text-slate-100 font-semibold tabular-nums">{p.price.toLocaleString()}₩</span>
                {p.discountPct > 0 && <span className="text-emerald-400">−{p.discountPct}%</span>}
                <span><Stars rating={p.rating} small /> ({p.reviewCount.toLocaleString()})</span>
                {p.isRocket && <span className="text-cyan-400">🚀 Rocket</span>}
                {p.recentBuyers && <span>{p.recentBuyers.toLocaleString()} за месяц</span>}
                <span className="text-slate-500 truncate">{p.seller}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {[5, 4, 3, 2, 1].map((s) => {
                  const pct = (dist[s - 1] / total) * 100
                  return (
                    <div key={s} className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span>{s}★</span>
                      <div className="w-12 bg-slate-800 rounded h-1.5">
                        <div
                          className={`h-full rounded ${s >= 4 ? 'bg-emerald-500' : s === 3 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {p.category && <div className="text-[10px] text-slate-500 mt-1 truncate">{p.category}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TagsTab({ tags }: { tags: TagRow[]; productMap: Map<string, ProductRow> }) {
  const aggregated = useMemo(() => {
    const m = new Map<string, { count: number; productIds: Set<string> }>()
    for (const t of tags) {
      const e = m.get(t.tag) ?? { count: 0, productIds: new Set() }
      e.count += t.count
      e.productIds.add(t.productId)
      m.set(t.tag, e)
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count)
  }, [tags])

  if (tags.length === 0)
    return <Empty>Хэштеги не найдены. Coupang меняет вёрстку — проверь regex в скрипте.</Empty>

  return (
    <div className="space-y-1">
      {aggregated.map(([tag, info]) => (
        <div key={tag} className="bg-slate-900 rounded px-4 py-2 flex items-center gap-4">
          <span className="text-slate-100 font-medium flex-1">{tag}</span>
          <span className="text-cyan-300 text-sm font-semibold tabular-nums">×{info.count}</span>
          <span className="text-slate-500 text-xs">на {info.productIds.size} тов.</span>
        </div>
      ))}
      <div className="text-xs text-slate-600 mt-3">
        (показано {aggregated.length} уникальных тегов; сырых записей {tags.length})
      </div>
    </div>
  )
}

// ============ Bits ============

function Card({
  title, subtitle, accent, children,
}: { title: string; subtitle?: string; accent?: 'red' | 'green' | 'amber' | 'cyan'; children: React.ReactNode }) {
  const accentColor =
    accent === 'red' ? 'text-red-400'
    : accent === 'green' ? 'text-emerald-400'
    : accent === 'amber' ? 'text-amber-400'
    : accent === 'cyan' ? 'text-cyan-300'
    : 'text-slate-200'
  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <div className="mb-3">
        <h2 className={`font-semibold ${accentColor}`}>{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function TopicChip({ topic, variant, onClick }: { topic: TopicRow; variant: 'pain' | 'positive'; onClick: () => void }) {
  const color =
    variant === 'pain'
      ? 'bg-red-500/15 text-red-200 border-red-500/30 hover:bg-red-500/25'
      : 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/25'
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${color}`}
      title={topic.quotes.join(' / ')}
    >
      <span className="opacity-70 mr-1">×{topic.count}</span>
      {topic.topic}
    </button>
  )
}

function Stars({ rating, small = false }: { rating: number; small?: boolean }) {
  const s = Math.round(rating)
  const size = small ? 'text-[10px]' : 'text-xs'
  return (
    <span className={`${size} tracking-tighter`}>
      <span className="text-amber-400">{'★'.repeat(s)}</span>
      <span className="text-slate-700">{'★'.repeat(Math.max(0, 5 - s))}</span>
    </span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-slate-500 py-6 text-center">{children}</div>
}

function BigMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-slate-100">{value}</div>
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  )
}

function CompetitionPill({ level }: { level: string }) {
  const map: Record<string, string> = {
    LOW: 'bg-emerald-500/20 text-emerald-300',
    MED: 'bg-amber-500/20 text-amber-300',
    HIGH: 'bg-red-500/20 text-red-300',
    UNKNOWN: 'bg-slate-800 text-slate-400',
  }
  return <span className={`text-[10px] px-2 py-0.5 rounded ${map[level] ?? map.UNKNOWN}`}>{competitionLabel(level)}</span>
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    high: 'bg-red-500/20 text-red-300',
    medium: 'bg-amber-500/20 text-amber-300',
    low: 'bg-slate-700 text-slate-300',
  }
  const label: Record<string, string> = { high: 'HIGH', medium: 'MED', low: 'LOW' }
  return <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${map[priority] ?? map.low}`}>{label[priority] ?? priority}</span>
}

function ImportanceBadge({ importance }: { importance: string }) {
  const map: Record<string, string> = {
    high: 'bg-emerald-500/25 text-emerald-200',
    medium: 'bg-slate-700 text-slate-300',
    low: 'bg-slate-800 text-slate-500',
  }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${map[importance] ?? map.low}`}>{importance}</span>
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: 'bg-red-500/30 text-red-200',
    major: 'bg-orange-500/25 text-orange-200',
    minor: 'bg-slate-700 text-slate-300',
  }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${map[severity] ?? map.minor}`}>{severity}</span>
}

function GapBadge({ gap }: { gap: string }) {
  const map: Record<string, string> = {
    positive: 'bg-emerald-500/20 text-emerald-300',
    negative: 'bg-red-500/20 text-red-300',
    neutral: 'bg-slate-700 text-slate-300',
  }
  const label: Record<string, string> = { positive: '↑ оправдалось', negative: '↓ не оправдалось', neutral: '— нейтрально' }
  return <span className={`text-[10px] px-2 py-0.5 rounded ${map[gap] ?? map.neutral}`}>{label[gap] ?? gap}</span>
}

function ShareBadge({ share }: { share: string }) {
  const map: Record<string, string> = {
    majority: 'bg-cyan-500/25 text-cyan-200',
    large: 'bg-blue-500/20 text-blue-300',
    niche: 'bg-slate-700 text-slate-400',
  }
  const label: Record<string, string> = { majority: 'большинство', large: 'значимый', niche: 'нишевой' }
  return <span className={`text-[10px] px-2 py-0.5 rounded ${map[share] ?? map.niche}`}>{label[share] ?? share}</span>
}

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    low: 'bg-slate-700 text-slate-300',
    mid: 'bg-cyan-500/20 text-cyan-300',
    high: 'bg-purple-500/25 text-purple-200',
  }
  const label: Record<string, string> = { low: 'BUDGET', mid: 'MID', high: 'PREMIUM' }
  return <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${map[tier] ?? map.low}`}>{label[tier] ?? tier}</span>
}

function competitionLabel(level: string): string {
  return level === 'LOW' ? 'низкая' : level === 'MED' ? 'средняя' : level === 'HIGH' ? 'высокая' : '—'
}

const METRIC_LABELS: Record<string, string> = {
  products: 'Активных листингов',
  sellers: 'Уникальных продавцов',
  medianPrice: 'Медиана цены, ₩',
  avgRating: 'Средний рейтинг',
  medianReviewCount: 'Медиана отзывов',
  totalReviewsCollected: 'Всего отзывов собрано',
  negativeShare: 'Доля негатива, %',
  top3Concentration: 'Концентрация ТОП-3, %',
  rocketShare: 'Доля Rocket, %',
}
function labelMetric(k: string) {
  return METRIC_LABELS[k] ?? k
}
function formatMetric(k: string, v: number | string) {
  if (typeof v === 'number') {
    if (k === 'medianPrice') return v.toLocaleString() + '₩'
    if (k.endsWith('Share') || k.endsWith('Concentration')) return v + '%'
    return v.toLocaleString()
  }
  return String(v)
}
