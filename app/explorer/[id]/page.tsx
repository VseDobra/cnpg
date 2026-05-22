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
  visionInsights: VisionInsights | null
  listingDraft: ListingDraft | null
  naverTrends: NaverTrendsResult | null
  products: ProductRow[]
  reviews: ReviewRow[]
  questions: QuestionRow[]
  tags: TagRow[]
  topics: TopicRow[]
}

interface VisionInsights {
  totalPhotosAnalyzed: number
  useCases: { context: string; share: string; description: string; count: number }[]
  commonDefects: { defect: string; severity: 'critical' | 'major' | 'minor'; mentions: number; description: string }[]
  photoOpportunities: { opportunity: string; why: string; priority: 'high' | 'medium' | 'low' }[]
  buyerProfile: string
  generatedAt: string
}

interface ListingDraft {
  koreanTitle: string
  ruTranslationOfTitle: string
  bullets: { ko: string; ru: string; addresses: string }[]
  description: { ko: string; ru: string }
  pricingSuggestion: { recommended: number; reasoning: string }
  imagesChecklist: string[]
  positioning: string
  generatedAt: string
}

interface NaverTrendsResult {
  keyword: string
  points: { period: string; ratio: number }[]
  peakMonth: { period: string; ratio: number } | null
  troughMonth: { period: string; ratio: number } | null
  seasonality: 'highly_seasonal' | 'seasonal' | 'stable' | 'unknown'
  yoyChange: number | null
  generatedAt: string
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
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null)
  const [visionRunning, setVisionRunning] = useState(false)
  const [visionError, setVisionError] = useState<string | null>(null)
  const [listingRunning, setListingRunning] = useState(false)
  const [listingError, setListingError] = useState<string | null>(null)
  const [trendsRunning, setTrendsRunning] = useState(false)
  const [trendsError, setTrendsError] = useState<string | null>(null)

  const callApi = async (
    path: string,
    setRunning: (b: boolean) => void,
    setError: (e: string | null) => void,
  ) => {
    setRunning(true)
    setError(null)
    try {
      const r = await fetch(path, { method: 'POST' })
      if (!r.ok) {
        const txt = await r.text()
        let msg = txt
        try {
          const j = JSON.parse(txt)
          msg = j.error || txt
        } catch {}
        throw new Error(msg || `HTTP ${r.status}`)
      }
      const fresh = await fetch(`/api/explorer/runs/${id}`).then((x) => x.json())
      setRun(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }
  const runReanalyze = () => callApi(`/api/explorer/runs/${id}/reanalyze`, setReanalyzing, setReanalyzeError)
  const runVision = () => callApi(`/api/explorer/runs/${id}/vision`, setVisionRunning, setVisionError)
  const runListing = () => callApi(`/api/explorer/runs/${id}/listing-draft`, setListingRunning, setListingError)
  const runTrends = () => callApi(`/api/explorer/runs/${id}/trends`, setTrendsRunning, setTrendsError)

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
            categoryProducts={categoryProducts}
            categoryReviews={categoryReviews}
            onPickTopic={(t) => {
              setTopicFilter(t)
              setTab('reviews')
            }}
            onOpenDemand={() => setTab('demand')}
            onReanalyze={runReanalyze}
            reanalyzing={reanalyzing}
            reanalyzeError={reanalyzeError}
            onRunVision={runVision}
            visionRunning={visionRunning}
            visionError={visionError}
            onRunListing={runListing}
            listingRunning={listingRunning}
            listingError={listingError}
            onRunTrends={runTrends}
            trendsRunning={trendsRunning}
            trendsError={trendsError}
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
  run, pains, positives, fears, ratingDist, verdictText, metrics, reasons, categoryFilter,
  categoryProducts, categoryReviews, onPickTopic, onOpenDemand, onReanalyze, reanalyzing, reanalyzeError,
  onRunVision, visionRunning, visionError,
  onRunListing, listingRunning, listingError,
  onRunTrends, trendsRunning, trendsError,
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
  categoryProducts: ProductRow[]
  categoryReviews: ReviewRow[]
  onPickTopic: (t: TopicRow) => void
  onOpenDemand: () => void
  onReanalyze: () => void
  reanalyzing: boolean
  reanalyzeError: string | null
  onRunVision: () => void
  visionRunning: boolean
  visionError: string | null
  onRunListing: () => void
  listingRunning: boolean
  listingError: string | null
  onRunTrends: () => void
  trendsRunning: boolean
  trendsError: string | null
}) {
  const hasPhotos = categoryReviews.some((r) => r.photos && r.photos.length > 0)
  const total = ratingDist.reduce((s, n) => s + n, 0) || 1
  const aiRan = pains.length > 0 || positives.length > 0
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

        {run.searchVolume && <KeywordTailPreview sv={run.searchVolume} onOpen={onOpenDemand} />}

        {!aiRan && (
          <AIEmptyCallout
            hasReviews={categoryReviews.length >= 10}
            onRun={onReanalyze}
            running={reanalyzing}
            error={reanalyzeError}
          />
        )}

        {aiRan && (
          <Card title="Боль клиентов" subtitle="клик → отзывы с этой темой" accent="red">
            {pains.length === 0 ? (
              <Empty>В этом срезе нет pain-тем.</Empty>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pains.map((t) => (
                  <TopicChip key={t.id} topic={t} variant="pain" onClick={() => onPickTopic(t)} />
                ))}
              </div>
            )}
          </Card>
        )}

        {aiRan && (
          <Card title="Что хвалят" subtitle="клик → отзывы" accent="green">
            {positives.length === 0 ? (
              <Empty>В этом срезе нет positive-тем.</Empty>
            ) : (
              <div className="flex flex-wrap gap-2">
                {positives.map((t) => (
                  <TopicChip key={t.id} topic={t} variant="positive" onClick={() => onPickTopic(t)} />
                ))}
              </div>
            )}
          </Card>
        )}

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

        <ReviewVelocity reviews={categoryReviews} />

        <CompetitiveMap products={categoryProducts} />

        <TopLeadersBreakdown products={categoryProducts} reviews={categoryReviews} />

        <VulnerabilityScores products={categoryProducts} reviews={categoryReviews} />

        <UnitEconomics products={categoryProducts} />

        <PriceTiersAndTitles products={categoryProducts} />

        <NaverTrendsCard nt={run.naverTrends} running={trendsRunning} error={trendsError} onRun={onRunTrends} />

        <VisionInsightsCard
          vi={run.visionInsights}
          running={visionRunning}
          error={visionError}
          hasPhotos={hasPhotos}
          onRun={onRunVision}
        />

        <ListingDraftCard ld={run.listingDraft} running={listingRunning} error={listingError} onRun={onRunListing} />

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

// ============ New analytics blocks ============

function CompetitiveMap({ products }: { products: ProductRow[] }) {
  const valid = products.filter((p) => p.price > 0 && p.rating > 0)
  if (valid.length < 3) return null

  const prices = valid.map((p) => p.price)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const maxReviews = Math.max(...valid.map((p) => p.reviewCount), 1)
  const sortedPrices = [...prices].sort((a, b) => a - b)
  const medPrice = sortedPrices[Math.floor(sortedPrices.length / 2)]

  const W = 720, H = 380, padL = 50, padR = 20, padT = 20, padB = 40
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const logMin = Math.log10(Math.max(minP, 100))
  const logMax = Math.log10(Math.max(maxP, minP + 1))
  const xOf = (price: number) =>
    padL + ((Math.log10(Math.max(price, 100)) - logMin) / Math.max(logMax - logMin, 0.001)) * plotW
  const yOf = (rating: number) => padT + plotH - ((Math.max(1, Math.min(5, rating)) - 1) / 4) * plotH
  const rOf = (rc: number) => 4 + Math.sqrt(rc / maxReviews) * 22

  const quadrants = {
    premium_high: valid.filter((p) => p.price >= medPrice && p.rating >= 4.5).length,
    premium_low: valid.filter((p) => p.price >= medPrice && p.rating < 4.5).length,
    budget_high: valid.filter((p) => p.price < medPrice && p.rating >= 4.5).length,
    budget_low: valid.filter((p) => p.price < medPrice && p.rating < 4.5).length,
  }
  const quadName: Record<string, string> = {
    premium_high: 'премиум + высокий рейтинг',
    premium_low: 'премиум + слабый рейтинг',
    budget_high: 'бюджет + высокий рейтинг',
    budget_low: 'бюджет + слабый рейтинг',
  }
  const sortedQ = Object.entries(quadrants).sort((a, b) => a[1] - b[1])
  const emptiest = sortedQ[0]
  const opportunityNote =
    emptiest[1] <= Math.max(1, Math.floor(valid.length * 0.1))
      ? `Дыра: «${quadName[emptiest[0]]}» — ${emptiest[1]} конкурент${emptiest[1] === 1 ? '' : 'ов'}. Возможный заход.`
      : `Все 4 квадранта заполнены — нет очевидной пустой ниши.`

  const xTicks = [minP, Math.round(Math.sqrt(minP * maxP)), maxP]
  const yTicks = [1, 2, 3, 4, 5]

  return (
    <Card title="Конкурентная карта" subtitle="цена × рейтинг × объём отзывов (лог-шкала цены)" accent="cyan">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#334155" />
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#334155" />
        <line x1={xOf(medPrice)} y1={padT} x2={xOf(medPrice)} y2={padT + plotH} stroke="#475569" strokeDasharray="3 3" />
        <text x={xOf(medPrice) + 4} y={padT + 10} fill="#64748b" fontSize="9">
          медиана цены
        </text>
        <line x1={padL} y1={yOf(4.5)} x2={padL + plotW} y2={yOf(4.5)} stroke="#475569" strokeDasharray="3 3" />
        <text x={padL + 4} y={yOf(4.5) - 3} fill="#64748b" fontSize="9">
          4.5★
        </text>
        {xTicks.map((p, i) => (
          <text key={i} x={xOf(p)} y={padT + plotH + 15} fill="#94a3b8" fontSize="10" textAnchor="middle">
            {p.toLocaleString()}₩
          </text>
        ))}
        {yTicks.map((r, i) => (
          <text key={i} x={padL - 6} y={yOf(r) + 3} fill="#94a3b8" fontSize="10" textAnchor="end">
            {r}★
          </text>
        ))}
        {valid.map((p) => {
          const fill = p.isRocket ? 'rgba(34,211,238,0.35)' : 'rgba(148,163,184,0.30)'
          const stroke = p.isRocket ? '#22d3ee' : '#94a3b8'
          return (
            <circle
              key={p.productId}
              cx={xOf(p.price)}
              cy={yOf(p.rating)}
              r={rOf(p.reviewCount)}
              fill={fill}
              stroke={stroke}
              strokeWidth="1"
            >
              <title>{`${p.name}\n${p.price.toLocaleString()}₩ · ★${p.rating} · ${p.reviewCount.toLocaleString()} отз.${
                p.isRocket ? ' · Rocket' : ''
              }`}</title>
            </circle>
          )
        })}
      </svg>
      <div className="text-xs text-slate-400 mt-3 flex items-start gap-2">
        <span className="text-amber-400 shrink-0">💡</span>
        <span>{opportunityNote}</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-1 flex gap-4 flex-wrap">
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-400/40 border border-cyan-400 mr-1" />
          Rocket
        </span>
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400/30 border border-slate-400 mr-1" />
          Seller-shipped
        </span>
        <span>размер ∝ кол-ву отзывов</span>
      </div>
    </Card>
  )
}

function TopLeadersBreakdown({ products, reviews }: { products: ProductRow[]; reviews: ReviewRow[] }) {
  const top = useMemo(
    () => [...products].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 3),
    [products],
  )
  const reviewsByProduct = useMemo(() => {
    const m = new Map<string, ReviewRow[]>()
    for (const r of reviews) {
      if (!m.has(r.productId)) m.set(r.productId, [])
      m.get(r.productId)!.push(r)
    }
    return m
  }, [reviews])

  if (top.length === 0) return null

  const totalReviews = products.reduce((s, p) => s + p.reviewCount, 0) || 1
  const sortedPrices = products.map((p) => p.price).filter((p) => p > 0).sort((a, b) => a - b)
  const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)] || 0

  return (
    <Card title="Анатомия топ-3 лидеров" subtitle="у кого сейчас рынок и где они уязвимы" accent="cyan">
      <div className="space-y-4">
        {top.map((p, idx) => {
          const rs = reviewsByProduct.get(p.productId) ?? []
          const negs = rs
            .filter((r) => r.rating <= 3)
            .sort((a, b) => b.helpful - a.helpful)
            .slice(0, 2)
          const poss = rs
            .filter((r) => r.rating >= 4)
            .sort((a, b) => b.helpful - a.helpful)
            .slice(0, 2)
          const share = ((p.reviewCount / totalReviews) * 100).toFixed(1)
          const priceVsMed =
            p.price && medianPrice ? Math.round(((p.price - medianPrice) / medianPrice) * 100) : null
          return (
            <div key={p.productId} className="bg-slate-900 rounded-lg p-4">
              <div className="flex items-start gap-4 mb-3">
                <div className="text-3xl font-black text-cyan-500/40 leading-none w-8 text-center pt-1">
                  #{idx + 1}
                </div>
                {p.firstImage && (
                  <a href={p.url} target="_blank" rel="noopener" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.firstImage}
                      alt=""
                      className="w-20 h-20 object-cover rounded border border-slate-800"
                    />
                  </a>
                )}
                <div className="flex-1 min-w-0">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-slate-100 hover:text-cyan-300 line-clamp-2 block"
                  >
                    {p.name}
                  </a>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5 flex-wrap">
                    <span className="text-slate-100 font-semibold tabular-nums">{p.price.toLocaleString()}₩</span>
                    {p.discountPct > 0 && <span className="text-emerald-400">−{p.discountPct}%</span>}
                    <span>
                      <Stars rating={p.rating} small /> {p.rating}
                    </span>
                    <span className="text-slate-500">{p.reviewCount.toLocaleString()} отз.</span>
                    {p.isRocket && <span className="text-cyan-400">🚀</span>}
                  </div>
                  <div className="flex gap-4 mt-2 text-[11px]">
                    <span className="text-slate-400">
                      Доля отзывов: <strong className="text-slate-200">{share}%</strong>
                    </span>
                    {priceVsMed != null && (
                      <span className="text-slate-400">
                        Цена vs медиана:{' '}
                        <strong className={priceVsMed >= 0 ? 'text-purple-300' : 'text-emerald-300'}>
                          {priceVsMed >= 0 ? '+' : ''}
                          {priceVsMed}%
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {(negs.length > 0 || poss.length > 0) && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1.5">Слабые места</div>
                    {negs.length === 0 ? (
                      <div className="text-slate-500 italic">— нет негативных в выборке —</div>
                    ) : (
                      negs.map((r) => (
                        <div key={r.id} className="text-slate-400 mb-1.5 border-l-2 border-red-500/30 pl-2">
                          <span className="text-red-300">{r.rating}★</span> {r.content.slice(0, 140)}
                          {r.content.length > 140 ? '…' : ''}
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1.5">За что любят</div>
                    {poss.length === 0 ? (
                      <div className="text-slate-500 italic">— нет положительных в выборке —</div>
                    ) : (
                      poss.map((r) => (
                        <div key={r.id} className="text-slate-400 mb-1.5 border-l-2 border-emerald-500/30 pl-2">
                          <span className="text-emerald-300">{r.rating}★</span> {r.content.slice(0, 140)}
                          {r.content.length > 140 ? '…' : ''}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function KeywordTailPreview({ sv, onOpen }: { sv: SearchVolumeSummary; onOpen: () => void }) {
  if (!sv.relatedTopN.length) {
    return (
      <Card title="Спрос на Naver" subtitle="реальный объём поиска" accent="cyan">
        <div className="grid grid-cols-4 gap-3">
          <BigMetric label="Запросов/мес" value={sv.seedMonthlyTotal.toLocaleString()} />
          <BigMetric label="Конкуренция" value={competitionLabel(sv.seedCompetition)} />
          <BigMetric label="Глубина рекламы" value={`${sv.seedAdDepth}/10`} />
          <BigMetric label="Экосистема" value={sv.totalEcosystemSearches.toLocaleString()} />
        </div>
      </Card>
    )
  }
  const top = sv.relatedTopN.slice(0, 10)
  const maxVolume = Math.max(...top.map((k) => k.monthlyTotal), sv.seedMonthlyTotal, 1)
  return (
    <Card
      title="Спрос на Naver + топ-10 связанных ключевиков"
      subtitle="реальный объём поиска и длинный хвост"
      accent="cyan"
    >
      <div className="grid grid-cols-3 gap-3 mb-4">
        <BigMetric label="Seed/мес" value={sv.seedMonthlyTotal.toLocaleString()} />
        <BigMetric label="Экосистема" value={sv.totalEcosystemSearches.toLocaleString()} />
        <BigMetric label="Связанных ключей" value={sv.relatedCount.toString()} />
      </div>
      <div className="space-y-1">
        {top.map((k) => {
          const pct = (k.monthlyTotal / maxVolume) * 100
          return (
            <div key={k.keyword} className="flex items-center gap-3 text-xs">
              <span className="text-slate-200 flex-1 truncate" title={k.keyword}>
                {k.keyword}
              </span>
              <span className="tabular-nums text-slate-400 w-16 text-right">
                {k.monthlyTotal.toLocaleString()}
              </span>
              <div className="w-24 bg-slate-800 rounded h-1.5 shrink-0">
                <div className="h-full bg-cyan-500 rounded" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right">
                <CompetitionPill level={k.competition} />
              </span>
            </div>
          )
        })}
      </div>
      <button onClick={onOpen} className="text-xs text-cyan-400 hover:text-cyan-300 mt-3">
        Все {sv.relatedCount} ключей в вкладке «Спрос» →
      </button>
    </Card>
  )
}

const KO_STOPWORDS = new Set([
  '및', '또는', '그리고', '하지만', '이런', '저런', '그런',
  '1개', '2개', '3개', '4개', '5개', '1+1', '2+1', '1+2',
])

function PriceTiersAndTitles({ products }: { products: ProductRow[] }) {
  const data = useMemo(() => {
    const prices = products.map((p) => p.price).filter((p) => p > 0).sort((a, b) => a - b)
    if (prices.length < 3) return null

    const min = prices[0]
    const max = prices[prices.length - 1]
    const logMin = Math.log10(Math.max(min, 100))
    const logMax = Math.log10(Math.max(max, min + 1))
    const nBins = Math.min(12, Math.max(5, Math.floor(prices.length / 3)))
    const bins: { lo: number; hi: number; count: number; isCluster: boolean }[] = []
    for (let i = 0; i < nBins; i++) {
      const lo = Math.round(Math.pow(10, logMin + ((logMax - logMin) * i) / nBins))
      const hi = Math.round(Math.pow(10, logMin + ((logMax - logMin) * (i + 1)) / nBins))
      bins.push({ lo, hi, count: 0, isCluster: false })
    }
    for (const p of prices) {
      const t = Math.max(0.0001, (Math.log10(Math.max(p, 100)) - logMin) / Math.max(logMax - logMin, 0.0001))
      const idx = Math.min(nBins - 1, Math.floor(t * nBins))
      bins[idx].count++
    }
    const avgPerBin = prices.length / nBins
    for (const b of bins) if (b.count >= avgPerBin * 1.5) b.isCluster = true

    const p33 = prices[Math.floor(prices.length * 0.33)]
    const p66 = prices[Math.floor(prices.length * 0.66)]
    const counts = new Map<string, number>()
    for (const p of products) {
      const tokens = (p.name || '')
        .split(/[\s,，\/·()\[\]+|&·]+/u)
        .map((t) => t.replace(/[.,;:!?"'`]+$/, '').replace(/^[.,;:!?"'`]+/, ''))
        .filter((t) => t.length >= 2 && !KO_STOPWORDS.has(t) && !/^\d+$/.test(t))
      const seen = new Set<string>()
      for (const t of tokens) {
        if (seen.has(t)) continue
        seen.add(t)
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }
    const topWords = [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)

    const maxBinCount = Math.max(...bins.map((b) => b.count), 1)
    const avgTitleLen =
      products.reduce((s, p) => s + (p.name?.length || 0), 0) / Math.max(products.length, 1)

    return { bins, p33, p66, topWords, maxBinCount, avgTitleLen }
  }, [products])

  if (!data) return null

  return (
    <div className="grid grid-cols-2 gap-6">
      <Card title="Ценовые тиры" subtitle="распределение цен — где толпа">
        <div className="flex items-end gap-1 h-32 mb-2">
          {data.bins.map((b, i) => {
            const h = (b.count / data.maxBinCount) * 100
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center justify-end gap-1"
                title={`${b.lo.toLocaleString()}–${b.hi.toLocaleString()}₩ · ${b.count} тов.`}
              >
                <div className="text-[9px] text-slate-500 tabular-nums">{b.count || ''}</div>
                <div
                  className={`w-full rounded-t ${b.isCluster ? 'bg-amber-500' : 'bg-cyan-600'}`}
                  style={{ height: `${Math.max(h, b.count > 0 ? 4 : 0)}%` }}
                />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 tabular-nums mb-3">
          <span>{data.bins[0].lo.toLocaleString()}₩</span>
          <span>{data.bins[data.bins.length - 1].hi.toLocaleString()}₩</span>
        </div>
        <div className="text-xs text-slate-300 grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Бюджет</div>
            <div className="font-semibold">≤{data.p33.toLocaleString()}₩</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Средний</div>
            <div className="font-semibold">
              {data.p33.toLocaleString()}–{data.p66.toLocaleString()}₩
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Премиум</div>
            <div className="font-semibold">≥{data.p66.toLocaleString()}₩</div>
          </div>
        </div>
        <div className="text-[10px] text-amber-400/80 mt-2">🟡 кластеры — там толпа конкурентов</div>
      </Card>

      <Card title="Топ-слова из названий" subtitle="что обязательно в title">
        {data.topWords.length === 0 ? (
          <Empty>Слишком мало повторов в названиях.</Empty>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.topWords.map(([word, count]) => {
              const size = count >= 10 ? 'text-base' : count >= 5 ? 'text-sm' : 'text-xs'
              const intensity = Math.min(1, count / 10)
              return (
                <span
                  key={word}
                  className={`${size} rounded px-2 py-0.5`}
                  style={{
                    background: `rgba(34, 211, 238, ${0.1 + intensity * 0.25})`,
                    color: `rgba(207, 250, 254, ${0.6 + intensity * 0.4})`,
                  }}
                  title={`встречается в ${count} названиях`}
                >
                  {word} <span className="opacity-60 tabular-nums">{count}</span>
                </span>
              )
            })}
          </div>
        )}
        <div className="text-[10px] text-slate-500 mt-3">
          Средняя длина названия: <strong className="text-slate-300">{Math.round(data.avgTitleLen)}</strong>{' '}
          символов
        </div>
      </Card>
    </div>
  )
}

function ReviewVelocity({ reviews }: { reviews: ReviewRow[] }) {
  const data = useMemo(() => {
    if (reviews.length < 5) return null
    const byMonth = new Map<string, number>()
    for (const r of reviews) {
      if (!r.reviewedAt || r.reviewedAt.length < 7) continue
      const ym = r.reviewedAt.slice(0, 7)
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + 1)
    }
    if (byMonth.size < 3) return null
    const sorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    // Take last 24 months for the chart
    const last24 = sorted.slice(-24)
    const maxCount = Math.max(...last24.map((m) => m[1]), 1)
    const total = last24.reduce((s, m) => s + m[1], 0)
    const avgPerMonth = total / last24.length
    // Last 3 months vs prior 3 months
    const tail = last24.slice(-3).reduce((s, m) => s + m[1], 0)
    const prev = last24.slice(-6, -3).reduce((s, m) => s + m[1], 0)
    const momentum = prev > 0 ? Math.round(((tail - prev) / prev) * 100) : null
    // Trend label
    let trend = 'стабильный'
    if (momentum != null) {
      if (momentum >= 30) trend = 'растёт'
      else if (momentum <= -30) trend = 'падает'
    }
    return { points: last24, maxCount, avgPerMonth, momentum, trend, total }
  }, [reviews])

  if (!data) return null

  const W = 720, H = 180, padL = 50, padR = 20, padT = 20, padB = 30
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const barW = plotW / data.points.length - 2
  const trendColor =
    data.trend === 'растёт' ? 'text-emerald-300' : data.trend === 'падает' ? 'text-red-300' : 'text-slate-300'

  return (
    <Card title="Темп отзывов" subtitle="отзывы в месяц за последние 24 мес — жива ли ниша" accent="cyan">
      <div className="flex items-baseline gap-6 mb-3 text-sm">
        <span className="text-slate-400">
          Среднее: <strong className="text-slate-100">{Math.round(data.avgPerMonth)}/мес</strong>
        </span>
        <span className="text-slate-400">
          Тренд:{' '}
          <strong className={trendColor}>
            {data.trend}
            {data.momentum != null && ` (${data.momentum >= 0 ? '+' : ''}${data.momentum}%)`}
          </strong>
        </span>
        <span className="text-slate-500 text-xs ml-auto">
          выборка прогона: {data.total.toLocaleString()} отз. с датами
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#334155" />
        {[0.25, 0.5, 0.75, 1].map((f, i) => (
          <line
            key={i}
            x1={padL}
            y1={padT + plotH - plotH * f}
            x2={padL + plotW}
            y2={padT + plotH - plotH * f}
            stroke="#1e293b"
            strokeDasharray="2 2"
          />
        ))}
        <text x={padL - 6} y={padT + 5} fill="#94a3b8" fontSize="9" textAnchor="end">
          {data.maxCount}
        </text>
        <text x={padL - 6} y={padT + plotH + 3} fill="#94a3b8" fontSize="9" textAnchor="end">
          0
        </text>
        {data.points.map(([ym, count], i) => {
          const h = (count / data.maxCount) * plotH
          const x = padL + i * (plotW / data.points.length)
          return (
            <g key={ym}>
              <rect x={x} y={padT + plotH - h} width={Math.max(1, barW)} height={h} fill="#22d3ee" opacity="0.7" />
              <title>{`${ym}: ${count} отз.`}</title>
            </g>
          )
        })}
        {data.points.length > 0 && (
          <>
            <text x={padL} y={padT + plotH + 18} fill="#64748b" fontSize="9" textAnchor="start">
              {data.points[0][0]}
            </text>
            <text x={padL + plotW} y={padT + plotH + 18} fill="#64748b" fontSize="9" textAnchor="end">
              {data.points[data.points.length - 1][0]}
            </text>
          </>
        )}
      </svg>
      <div className="text-[10px] text-slate-500 mt-2">
        💡 Темп считается по датам собранных отзывов — это <strong>не</strong> объём поиска, это активность покупателей.
        Если темп растёт — ниша созревает; падает — спрос остывает.
      </div>
    </Card>
  )
}

function VulnerabilityScores({ products, reviews }: { products: ProductRow[]; reviews: ReviewRow[] }) {
  const ranked = useMemo(() => {
    if (products.length < 3) return []
    const negsByProduct = new Map<string, number>()
    for (const r of reviews) {
      if (r.rating <= 2) negsByProduct.set(r.productId, (negsByProduct.get(r.productId) ?? 0) + 1)
    }
    const sortedPrices = products.map((p) => p.price).filter((p) => p > 0).sort((a, b) => a - b)
    const medPrice = sortedPrices[Math.floor(sortedPrices.length / 2)] || 0

    return [...products]
      .filter((p) => p.reviewCount >= 5)
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 15)
      .map((p) => {
        let score = 0
        const factors: string[] = []
        // Низкий рейтинг
        if (p.rating > 0 && p.rating < 4.5) {
          const r = (4.5 - p.rating) * 20
          score += r
          factors.push(`рейтинг ${p.rating} (+${Math.round(r)})`)
        }
        // Доля негатива у этого товара
        const negs = negsByProduct.get(p.productId) ?? 0
        if (negs >= 3) {
          const n = Math.min(30, negs * 3)
          score += n
          factors.push(`${negs} негативов 1-2★ (+${n})`)
        }
        // Мало фото на карточке
        if (p.imageCount <= 1) {
          score += 10
          factors.push('мало фото (+10)')
        }
        // Завышенная цена vs медианы
        if (medPrice > 0 && p.price > medPrice * 1.4) {
          const c = Math.min(20, Math.round(((p.price - medPrice) / medPrice) * 30))
          score += c
          factors.push(`цена +${Math.round(((p.price - medPrice) / medPrice) * 100)}% к медиане (+${c})`)
        }
        // Не Rocket — слабее по логистике
        if (!p.isRocket) {
          score += 5
          factors.push('не Rocket (+5)')
        }
        return { product: p, score: Math.round(score), factors, negs }
      })
      .sort((a, b) => b.score - a.score)
  }, [products, reviews])

  if (ranked.length === 0) return null

  return (
    <Card title="Кого атаковать первым" subtitle="vulnerability score — чем выше, тем легче отбить долю" accent="amber">
      <div className="space-y-2">
        {ranked.slice(0, 8).map(({ product, score, factors }, i) => {
          const color = score >= 50 ? 'text-red-300' : score >= 25 ? 'text-amber-300' : 'text-slate-400'
          const bg = score >= 50 ? 'bg-red-500/10' : score >= 25 ? 'bg-amber-500/10' : 'bg-slate-800/50'
          return (
            <div key={product.productId} className={`${bg} rounded-lg p-3 flex items-center gap-3`}>
              <div className={`text-2xl font-black ${color} w-12 text-center tabular-nums`}>{score}</div>
              {product.firstImage && (
                <a href={product.url} target="_blank" rel="noopener" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.firstImage}
                    alt=""
                    className="w-12 h-12 object-cover rounded border border-slate-800"
                  />
                </a>
              )}
              <div className="flex-1 min-w-0">
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener"
                  className="text-sm text-slate-100 hover:text-cyan-300 line-clamp-1"
                >
                  #{i + 1} {product.name}
                </a>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                  <span>{product.price.toLocaleString()}₩</span>
                  <span>★{product.rating}</span>
                  <span>{product.reviewCount.toLocaleString()} отз.</span>
                  {factors.length > 0 && (
                    <span className="text-slate-500 text-[10px]">· {factors.join(' · ')}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="text-[10px] text-slate-500 mt-3">
        Формула: rating(20×gap), 1-2★ отзывы (×3), мало фото (+10), цена &gt; медианы +40% (×30), не-Rocket (+5).
      </div>
    </Card>
  )
}

const DEFAULTS_KR = {
  commission: 10.8, // Coupang fee
  adRate: 5.0,
  taxRate: 10.0, // VAT
  costRate: 35.0, // wholesale as % of retail
  rgFee: 2500, // logistics RG fee per item ₩
}

function UnitEconomics({ products }: { products: ProductRow[] }) {
  const [commission, setCommission] = useState(DEFAULTS_KR.commission)
  const [adRate, setAdRate] = useState(DEFAULTS_KR.adRate)
  const [tax, setTax] = useState(DEFAULTS_KR.taxRate)
  const [costRate, setCostRate] = useState(DEFAULTS_KR.costRate)
  const [rgFee, setRgFee] = useState(DEFAULTS_KR.rgFee)

  const stats = useMemo(() => {
    const prices = products.map((p) => p.price).filter((p) => p > 0).sort((a, b) => a - b)
    if (!prices.length) return null
    return {
      med: prices[Math.floor(prices.length / 2)],
      p33: prices[Math.floor(prices.length * 0.33)],
      p66: prices[Math.floor(prices.length * 0.66)],
      min: prices[0],
      max: prices[prices.length - 1],
    }
  }, [products])

  if (!stats) return null

  const calc = (price: number) => {
    const cost = (price * costRate) / 100
    const fees = (price * (commission + adRate)) / 100
    const vat = (price * tax) / 100
    const net = price - cost - fees - vat - rgFee
    const margin = price > 0 ? (net / price) * 100 : 0
    return { cost, fees, vat, net, margin, rgFee }
  }
  const breakEvenPrice = (() => {
    // ищем минимальную цену при которой net >= 0
    const denom = 1 - costRate / 100 - (commission + adRate) / 100 - tax / 100
    if (denom <= 0) return null
    return Math.ceil(rgFee / denom)
  })()
  const priceFor30 = (() => {
    const denom = 1 - costRate / 100 - (commission + adRate) / 100 - tax / 100 - 0.3
    if (denom <= 0) return null
    return Math.ceil(rgFee / denom)
  })()

  const rows = [
    { label: 'Бюджет (p33)', price: stats.p33 },
    { label: 'Медиана', price: stats.med },
    { label: 'Премиум (p66)', price: stats.p66 },
  ]

  return (
    <Card title="Юнит-экономика" subtitle="можно ли тут зарабатывать (поправь параметры под себя)" accent="cyan">
      <div className="grid grid-cols-5 gap-3 mb-4">
        <NumberInput label="Закупка %" value={costRate} onChange={setCostRate} />
        <NumberInput label="Комиссия %" value={commission} onChange={setCommission} />
        <NumberInput label="Реклама %" value={adRate} onChange={setAdRate} />
        <NumberInput label="НДС %" value={tax} onChange={setTax} />
        <NumberInput label="RG fee ₩" value={rgFee} onChange={setRgFee} step={100} />
      </div>

      <div className="bg-slate-900 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-xs text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">Цена</th>
              <th className="text-right px-3 py-2">Закупка</th>
              <th className="text-right px-3 py-2">Fees</th>
              <th className="text-right px-3 py-2">НДС</th>
              <th className="text-right px-3 py-2">RG</th>
              <th className="text-right px-3 py-2">Чистая</th>
              <th className="text-right px-3 py-2">Маржа</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, price }) => {
              const c = calc(price)
              const marginColor =
                c.margin >= 25 ? 'text-emerald-300' : c.margin >= 10 ? 'text-amber-300' : 'text-red-300'
              return (
                <tr key={label} className="border-t border-slate-800">
                  <td className="px-3 py-2">
                    <div className="text-slate-200 font-medium">{label}</div>
                    <div className="text-xs text-slate-500 tabular-nums">{price.toLocaleString()}₩</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    −{Math.round(c.cost).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    −{Math.round(c.fees).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    −{Math.round(c.vat).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    −{c.rgFee.toLocaleString()}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${c.net >= 0 ? 'text-slate-100' : 'text-red-300'}`}>
                    {Math.round(c.net).toLocaleString()}₩
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-bold ${marginColor}`}>
                    {c.margin.toFixed(1)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-slate-900 rounded p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Break-even цена</div>
          <div className="text-lg font-bold text-slate-100 tabular-nums">
            {breakEvenPrice != null ? `${breakEvenPrice.toLocaleString()}₩` : 'нереально'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">ниже — работаешь в минус</div>
        </div>
        <div className="bg-slate-900 rounded p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Цена для маржи 30%</div>
          <div
            className={`text-lg font-bold tabular-nums ${
              priceFor30 == null
                ? 'text-red-300'
                : priceFor30 <= stats.max
                ? 'text-emerald-300'
                : 'text-amber-300'
            }`}
          >
            {priceFor30 != null ? `${priceFor30.toLocaleString()}₩` : 'нереально'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {priceFor30 != null && priceFor30 <= stats.max
              ? `в пределах рыночного диапазона`
              : 'выше топа ниши — придётся либо снижать закупку, либо игнорить нишу'}
          </div>
        </div>
      </div>
    </Card>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1 w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-100 tabular-nums focus:outline-none focus:border-cyan-500"
      />
    </label>
  )
}

function VisionInsightsCard({
  vi,
  running,
  error,
  hasPhotos,
  onRun,
}: {
  vi: VisionInsights | null
  running: boolean
  error: string | null
  hasPhotos: boolean
  onRun: () => void
}) {
  if (!vi) {
    return (
      <Card title="Vision-разбор фото отзывов" subtitle="как реально юзают товар и что снимать в листинге" accent="amber">
        <p className="text-sm text-slate-300 mb-3">
          {hasPhotos
            ? 'AI разберёт фото покупателей и выдаст use-cases, частые дефекты, чек-лист фото для своего листинга.'
            : 'Нет фото в собранных отзывах. Пересобери прогон или попробуй на нише где больше фото.'}
        </p>
        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>
        )}
        <button
          onClick={onRun}
          disabled={running || !hasPhotos}
          className="bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-200 border border-amber-500/40 text-sm px-4 py-2 rounded transition-colors"
        >
          {running ? 'Vision работает... (~45 сек)' : 'Запустить Vision-разбор'}
        </button>
        <p className="text-[10px] text-slate-500 mt-2">~30¢ за прогон (30 фото через Claude Sonnet).</p>
      </Card>
    )
  }
  return (
    <Card
      title="Vision-разбор фото отзывов"
      subtitle={`на основе ${vi.totalPhotosAnalyzed} фото покупателей`}
      accent="cyan"
    >
      {vi.buyerProfile && (
        <div className="bg-slate-900 rounded p-3 mb-4 text-sm">
          <div className="text-[10px] uppercase tracking-wider text-cyan-400 mb-1">Типичный покупатель</div>
          <p className="text-slate-300">{vi.buyerProfile}</p>
        </div>
      )}

      {vi.useCases.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Сценарии использования</h4>
          <div className="grid grid-cols-2 gap-2">
            {vi.useCases.map((u, i) => (
              <div key={i} className="bg-slate-900 rounded p-3 border-l-2 border-cyan-500/40">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-medium text-slate-100">{u.context}</span>
                  <ShareBadge share={u.share} />
                  <span className="text-xs text-slate-500 ml-auto">×{u.count}</span>
                </div>
                <p className="text-xs text-slate-400">{u.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {vi.commonDefects.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs uppercase tracking-wider text-red-400 mb-2">Частые дефекты в негативных фото</h4>
          <div className="space-y-2">
            {vi.commonDefects.map((d, i) => (
              <div key={i} className="bg-slate-900 rounded p-3 border-l-2 border-red-500/40">
                <div className="flex items-baseline gap-2 mb-1">
                  <SeverityBadge severity={d.severity} />
                  <span className="font-medium text-slate-100 flex-1">{d.defect}</span>
                  <span className="text-xs text-slate-500">×{d.mentions}</span>
                </div>
                <p className="text-xs text-slate-400">{d.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {vi.photoOpportunities.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider text-emerald-400 mb-2">
            Что снять в своём листинге (чек-лист)
          </h4>
          <ul className="space-y-1.5">
            {vi.photoOpportunities.map((o, i) => (
              <li key={i} className="flex gap-2 items-start text-sm bg-slate-900 rounded p-2.5">
                <PriorityBadge priority={o.priority} />
                <div className="flex-1">
                  <p className="text-slate-200">{o.opportunity}</p>
                  <p className="text-xs text-slate-500 mt-0.5">↳ {o.why}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-[10px] text-slate-500 mt-3">
        Сгенерировано: {new Date(vi.generatedAt).toLocaleString('ru-RU')}.{' '}
        <button onClick={onRun} disabled={running} className="text-cyan-400 hover:text-cyan-300 disabled:opacity-50">
          {running ? 'обновляется...' : 'перегенерировать'}
        </button>
      </div>
    </Card>
  )
}

function ListingDraftCard({
  ld,
  running,
  error,
  onRun,
}: {
  ld: ListingDraft | null
  running: boolean
  error: string | null
  onRun: () => void
}) {
  if (!ld) {
    return (
      <Card title="AI-драфт листинга" subtitle="готовый KR title + bullets + описание + цена" accent="amber">
        <p className="text-sm text-slate-300 mb-3">
          Один Claude-запрос синтезирует листинг из всех собранных данных (pains, positives, pre-fears, цены лидеров,
          хэштеги). Получишь корейский title с ключом, 5 буллетов закрывающих pre-fears, описание против слабостей
          топ-3, цену и чек-лист фото.
        </p>
        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>
        )}
        <button
          onClick={onRun}
          disabled={running}
          className="bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-200 border border-amber-500/40 text-sm px-4 py-2 rounded transition-colors"
        >
          {running ? 'Claude думает... (~30 сек)' : 'Сгенерировать драфт листинга'}
        </button>
        <p className="text-[10px] text-slate-500 mt-2">~5¢ за драфт.</p>
      </Card>
    )
  }
  return (
    <Card title="AI-драфт листинга" subtitle="готов к копированию" accent="cyan">
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-400 mb-1">Корейское название</div>
          <div className="bg-slate-900 rounded p-3 font-medium text-slate-100 break-words">{ld.koreanTitle}</div>
          <div className="text-xs text-slate-500 mt-1">{ld.ruTranslationOfTitle}</div>
        </div>

        {ld.bullets.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cyan-400 mb-2">5 буллетов</div>
            <div className="space-y-2">
              {ld.bullets.map((b, i) => (
                <div key={i} className="bg-slate-900 rounded p-3">
                  <div className="text-slate-100 font-medium mb-1">
                    {i + 1}. {b.ko}
                  </div>
                  <div className="text-xs text-slate-400">{b.ru}</div>
                  {b.addresses && (
                    <div className="text-[10px] text-emerald-400/80 mt-1">
                      ↳ закрывает: <em>{b.addresses}</em>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {ld.description.ko && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cyan-400 mb-1">Описание</div>
            <div className="bg-slate-900 rounded p-3 text-sm text-slate-100 whitespace-pre-wrap">
              {ld.description.ko}
            </div>
            <div className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{ld.description.ru}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900 rounded p-3">
            <div className="text-[10px] uppercase tracking-wider text-cyan-400 mb-1">Рекомендованная цена</div>
            <div className="text-2xl font-bold text-slate-100 tabular-nums">
              {ld.pricingSuggestion.recommended.toLocaleString()}₩
            </div>
            <div className="text-xs text-slate-400 mt-1">{ld.pricingSuggestion.reasoning}</div>
          </div>
          <div className="bg-slate-900 rounded p-3">
            <div className="text-[10px] uppercase tracking-wider text-cyan-400 mb-1">Позиционирование</div>
            <p className="text-sm text-slate-200">{ld.positioning}</p>
          </div>
        </div>

        {ld.imagesChecklist.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cyan-400 mb-2">Чек-лист фото для листинга</div>
            <ol className="space-y-1.5">
              {ld.imagesChecklist.map((c, i) => (
                <li key={i} className="text-sm bg-slate-900 rounded p-2.5 flex gap-2">
                  <span className="text-cyan-400 font-bold shrink-0 tabular-nums">{i + 1}.</span>
                  <span className="text-slate-200">{c}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="text-[10px] text-slate-500">
          Сгенерировано: {new Date(ld.generatedAt).toLocaleString('ru-RU')}.{' '}
          <button onClick={onRun} disabled={running} className="text-cyan-400 hover:text-cyan-300 disabled:opacity-50">
            {running ? 'обновляется...' : 'перегенерировать'}
          </button>
        </div>
      </div>
    </Card>
  )
}

function NaverTrendsCard({
  nt,
  running,
  error,
  onRun,
}: {
  nt: NaverTrendsResult | null
  running: boolean
  error: string | null
  onRun: () => void
}) {
  if (!nt) {
    return (
      <Card title="Google Trends — 12 мес" subtitle="сезонность ключевика" accent="amber">
        <p className="text-sm text-slate-300 mb-3">
          Тренд популярности ключевика в Корее за последние 12 месяцев. Поможет понять — сезонный товар или нет, когда
          лучше заводить рекламу.
        </p>
        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>
        )}
        <button
          onClick={onRun}
          disabled={running}
          className="bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-200 border border-amber-500/40 text-sm px-4 py-2 rounded transition-colors"
        >
          {running ? 'Загрузка трендов...' : 'Получить тренды'}
        </button>
        <p className="text-[10px] text-slate-500 mt-2">Бесплатно через google-trends-api.</p>
      </Card>
    )
  }
  const W = 720, H = 160, padL = 30, padR = 20, padT = 15, padB = 30
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const maxRatio = Math.max(...nt.points.map((p) => p.ratio), 1)
  const xOf = (i: number) => padL + (i / Math.max(nt.points.length - 1, 1)) * plotW
  const yOf = (v: number) => padT + plotH - (v / maxRatio) * plotH
  const path = nt.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.ratio).toFixed(1)}`).join(' ')
  const seasonalLabel: Record<typeof nt.seasonality, string> = {
    highly_seasonal: '⚠️ сильно сезонный',
    seasonal: '🟡 сезонный',
    stable: '🟢 стабильный',
    unknown: '— нет данных',
  }
  return (
    <Card title={`Google Trends — "${nt.keyword}"`} subtitle="12 месяцев интереса в Корее" accent="cyan">
      <div className="flex items-baseline gap-6 mb-3 text-sm flex-wrap">
        <span className="text-slate-400">Сезонность: <strong className="text-slate-100">{seasonalLabel[nt.seasonality]}</strong></span>
        {nt.peakMonth && (
          <span className="text-slate-400">
            Пик: <strong className="text-emerald-300">{nt.peakMonth.period}</strong> ({nt.peakMonth.ratio})
          </span>
        )}
        {nt.troughMonth && (
          <span className="text-slate-400">
            Минимум: <strong className="text-red-300">{nt.troughMonth.period}</strong> ({nt.troughMonth.ratio})
          </span>
        )}
        {nt.yoyChange != null && (
          <span className="text-slate-400">
            YoY: <strong className={nt.yoyChange >= 0 ? 'text-emerald-300' : 'text-red-300'}>
              {nt.yoyChange >= 0 ? '+' : ''}{nt.yoyChange}%
            </strong>
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#334155" />
        <path d={path} fill="none" stroke="#22d3ee" strokeWidth="2" />
        <path d={`${path} L${xOf(nt.points.length - 1)},${padT + plotH} L${padL},${padT + plotH} Z`} fill="rgba(34,211,238,0.15)" />
        {nt.points.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(p.ratio)} r="2" fill="#22d3ee">
            <title>{`${p.period}: ${p.ratio}`}</title>
          </circle>
        ))}
        <text x={padL} y={padT + plotH + 18} fill="#64748b" fontSize="9" textAnchor="start">
          {nt.points[0]?.period}
        </text>
        <text x={padL + plotW} y={padT + plotH + 18} fill="#64748b" fontSize="9" textAnchor="end">
          {nt.points[nt.points.length - 1]?.period}
        </text>
      </svg>
      <div className="text-[10px] text-slate-500 mt-2">
        Шкала Google Trends: 0-100 относительно пика за период. Сгенерировано: {new Date(nt.generatedAt).toLocaleString('ru-RU')}.{' '}
        <button onClick={onRun} disabled={running} className="text-cyan-400 hover:text-cyan-300 disabled:opacity-50">
          {running ? 'обновление...' : 'обновить'}
        </button>
      </div>
    </Card>
  )
}

function AIEmptyCallout({
  hasReviews,
  onRun,
  running,
  error,
}: {
  hasReviews: boolean
  onRun: () => void
  running: boolean
  error: string | null
}) {
  return (
    <Card title="AI-разбор отзывов" subtitle="pains / positives / pre-fears" accent="amber">
      <p className="text-sm text-slate-300 mb-3">
        {hasReviews
          ? 'Отзывы собраны, но AI ещё не разобрал их по темам. Запусти разбор — это сделает «Боль клиентов», «Что хвалят» и «Страхи до покупки», даст 6 табов в Google Sheets и стратегические инсайты.'
          : 'Слишком мало отзывов (нужно ≥10). Запусти прогон скрипта на большую категорию.'}
      </p>
      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">
          {error}
        </div>
      )}
      <button
        onClick={onRun}
        disabled={running || !hasReviews}
        className="bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-200 border border-amber-500/40 text-sm px-4 py-2 rounded transition-colors"
      >
        {running ? 'AI работает... (~30 сек)' : 'Запустить AI-разбор'}
      </button>
      <p className="text-[10px] text-slate-500 mt-2">
        Нужен <span className="font-mono">ANTHROPIC_API_KEY</span> в .env.local. Стоимость ~3-5¢ на прогон.
      </p>
    </Card>
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
