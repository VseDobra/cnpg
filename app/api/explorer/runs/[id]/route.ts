import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const run = await prisma.scraperRun.findUnique({
    where: { id },
    include: {
      products: { orderBy: [{ searchRank: 'asc' }, { reviewCount: 'desc' }] },
      reviews: { orderBy: [{ helpful: 'desc' }] },
      questions: true,
      tags: true,
      topics: { orderBy: [{ kind: 'asc' }, { rank: 'asc' }] },
    },
  })

  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const parsed = {
    ...run,
    metrics: safeJson(run.metrics, {}),
    reasons: safeJson<string[]>(run.reasons, []),
    sheetTabs: safeJson<string[]>(run.sheetTabs ?? '[]', []),
    searchVolume: safeJson(run.searchVolume ?? 'null', null),
    aiExtended: normalizeAiExtended(safeJson<Record<string, unknown> | null>(run.aiExtended ?? 'null', null)),
    visionInsights: normalizeVisionInsights(safeJson<Record<string, unknown> | null>(run.visionInsights ?? 'null', null)),
    listingDraft: normalizeListingDraft(safeJson<Record<string, unknown> | null>(run.listingDraft ?? 'null', null)),
    naverTrends: normalizeNaverTrends(safeJson<Record<string, unknown> | null>(run.naverTrends ?? 'null', null)),
    reviews: run.reviews.map((r) => ({ ...r, photos: safeJson<string[]>(r.photos, []) })),
    topics: run.topics.map((t) => ({
      ...t,
      quotes: safeJson<string[]>(t.quotes, []),
      reviewIds: safeJson<string[]>(t.reviewIds, []),
    })),
  }

  return NextResponse.json(parsed)
}

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

// Гарантируем что у aiExtended/visionInsights/listingDraft/naverTrends
// всегда есть все массивы/поля — UI обращается к .length без guards.
// Старые записи могли быть сохранены без части полей (AI вернул частичный JSON).
function normalizeAiExtended(v: Record<string, unknown> | null) {
  if (!v) return null
  return {
    positiveDrivers: asArray(v.positiveDrivers),
    improvementAreas: asArray(v.improvementAreas),
    expectationEvolution: asArray(v.expectationEvolution),
    demographics: asArray<Record<string, unknown>>(v.demographics).map((d) => ({
      ...d,
      signals: asArray(d.signals),
      needs: asArray(d.needs),
    })),
    priceTiers: asArray(v.priceTiers),
    strategicInsights: asArray(v.strategicInsights),
  }
}

function normalizeVisionInsights(v: Record<string, unknown> | null) {
  if (!v) return null
  return {
    totalPhotosAnalyzed: Number(v.totalPhotosAnalyzed ?? 0),
    useCases: asArray(v.useCases),
    commonDefects: asArray(v.commonDefects),
    photoOpportunities: asArray(v.photoOpportunities),
    buyerProfile: String(v.buyerProfile ?? ''),
    generatedAt: String(v.generatedAt ?? ''),
  }
}

function normalizeListingDraft(v: Record<string, unknown> | null) {
  if (!v) return null
  const desc = (v.description ?? {}) as Record<string, unknown>
  const price = (v.pricingSuggestion ?? {}) as Record<string, unknown>
  return {
    koreanTitle: String(v.koreanTitle ?? ''),
    ruTranslationOfTitle: String(v.ruTranslationOfTitle ?? ''),
    bullets: asArray(v.bullets),
    description: { ko: String(desc.ko ?? ''), ru: String(desc.ru ?? '') },
    pricingSuggestion: {
      recommended: Number(price.recommended ?? 0),
      reasoning: String(price.reasoning ?? ''),
    },
    imagesChecklist: asArray<string>(v.imagesChecklist),
    positioning: String(v.positioning ?? ''),
    generatedAt: String(v.generatedAt ?? ''),
  }
}

function normalizeNaverTrends(v: Record<string, unknown> | null) {
  if (!v) return null
  return {
    keyword: String(v.keyword ?? ''),
    points: asArray(v.points),
    peakMonth: (v.peakMonth ?? null) as { period: string; ratio: number } | null,
    troughMonth: (v.troughMonth ?? null) as { period: string; ratio: number } | null,
    seasonality: (v.seasonality ?? 'unknown') as 'highly_seasonal' | 'seasonal' | 'stable' | 'unknown',
    yoyChange: v.yoyChange == null ? null : Number(v.yoyChange),
    generatedAt: String(v.generatedAt ?? ''),
  }
}
