import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { writeNicheAnalysis, type Review, type Product, type Tag, type Question } from '@/lib/google/sheets-analysis'
import { analyzeReviewsAI, writeAIAnalysisToSheet, type AIAnalysis } from '@/lib/google/sheets-ai'
import { getKeywordStats, summarize, type NicheSearchSummary } from '@/lib/naver/ads'
import { linkCompletedRun } from '@/lib/explorer/rerun-scan'

export const runtime = 'nodejs'
export const maxDuration = 300

const ALLOWED_ORIGINS = new Set([
  'https://www.coupang.com',
  'https://m.coupang.com',
  'http://localhost:3000',
  'http://localhost:3001',
])

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '*'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

async function persistRun(input: {
  keyword: string
  verdict: { level: string; text: string; reasons: string[]; metrics: Record<string, number | string> }
  reviews: Review[]
  products: Product[]
  tags: Tag[]
  questions: Question[]
  sheetTabs: string[]
  analysis: AIAnalysis | null
  searchVolume: NicheSearchSummary | null
}) {
  const { keyword, verdict, reviews, products, tags, questions, sheetTabs, analysis, searchVolume } = input

  const run = await prisma.scraperRun.create({
    data: {
      keyword,
      verdictLevel: verdict.level,
      verdictText: verdict.text,
      metrics: JSON.stringify(verdict.metrics),
      reasons: JSON.stringify(verdict.reasons),
      sheetTabs: JSON.stringify(sheetTabs),
      reviewCount: reviews.length,
      productCount: products.length,
      searchVolume: searchVolume ? JSON.stringify(searchVolume) : null,
      aiExtended: analysis?.extended ? JSON.stringify(analysis.extended) : null,
    },
  })

  if (products.length) {
    await prisma.scrapedProduct.createMany({
      data: products.map((p) => ({
        runId: run.id,
        productId: p.productId,
        name: p.name,
        price: Math.round(p.price || 0),
        originalPrice: Math.round(p.originalPrice || 0),
        discountPct: Math.round(p.discountPct || 0),
        couponDiscount: Math.round(p.couponDiscount || 0),
        rating: p.rating || 0,
        reviewCount: p.reviewCount || 0,
        imageCount: p.imageCount || 0,
        firstImage: p.firstImage || '',
        category: p.category || '',
        url: p.url || '',
        seller: p.seller || '',
        isRocket: !!p.isRocket,
        isWow: !!p.isWow,
        recentBuyers: p.recentBuyers ?? null,
        searchRank: p.searchRank ?? null,
      })),
    })
  }

  if (reviews.length) {
    // Batch reviews to avoid SQLite parameter limit
    const chunk = 500
    for (let i = 0; i < reviews.length; i += chunk) {
      await prisma.scrapedReview.createMany({
        data: reviews.slice(i, i + chunk).map((r) => ({
          runId: run.id,
          productId: r.productId,
          productName: r.productName,
          reviewId: String(r.reviewId),
          rating: Math.round(r.rating || 0),
          reviewedAt: r.date || '',
          reviewer: r.reviewer || '',
          helpful: r.helpful || 0,
          title: r.title || '',
          content: r.content || '',
          photos: JSON.stringify(r.photos ?? []),
        })),
      })
    }
  }

  if (questions.length) {
    await prisma.scrapedQuestion.createMany({
      data: questions.map((q) => ({
        runId: run.id,
        productId: q.productId,
        questionId: q.questionId || '',
        question: q.question,
        answer: q.answer || '',
        askedAt: q.askedAt || null,
        answeredAt: q.answeredAt || null,
      })),
    })
  }

  if (tags.length) {
    await prisma.scrapedTag.createMany({
      data: tags.map((t) => ({
        runId: run.id,
        productId: t.productId,
        tag: t.tag,
        count: t.count || 0,
      })),
    })
  }

  if (analysis) {
    const topicRows = [
      ...analysis.pains.map((p, idx) => ({
        runId: run.id,
        kind: 'pain',
        topic: p.topic,
        count: p.count,
        quotes: JSON.stringify(p.quotes ?? []),
        reviewIds: JSON.stringify(p.reviewIds ?? []),
        rank: idx,
      })),
      ...analysis.positives.map((p, idx) => ({
        runId: run.id,
        kind: 'positive',
        topic: p.topic,
        count: p.count,
        quotes: JSON.stringify(p.quotes ?? []),
        reviewIds: JSON.stringify(p.reviewIds ?? []),
        rank: idx,
      })),
      ...(analysis.preFears ?? []).map((f, idx) => ({
        runId: run.id,
        kind: 'fear',
        topic: f.topic,
        count: f.count,
        quotes: JSON.stringify(f.examples ?? []),
        reviewIds: '[]',
        rank: idx,
      })),
    ]
    if (topicRows.length) await prisma.scrapedTopic.createMany({ data: topicRows })
  }

  return run.id
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get('origin'))
  const body = await req.json().catch(() => ({}))
  const { reviews, products, tags, questions, sheetId, sheetName, keyword } = body as {
    reviews?: Review[]
    products?: Product[]
    tags?: Tag[]
    questions?: Question[]
    sheetId?: string
    sheetName?: string
    keyword?: string
  }

  if (!Array.isArray(reviews)) return NextResponse.json({ error: 'reviews array required' }, { status: 400, headers })
  if (!Array.isArray(products)) return NextResponse.json({ error: 'products array required' }, { status: 400, headers })

  const safeTags = Array.isArray(tags) ? tags : []
  const safeQuestions = Array.isArray(questions) ? questions : []
  const baseName = sheetName?.trim() || `${keyword?.trim() || 'niche'}_${new Date().toISOString().slice(0, 10)}`

  try {
    if (!sheetId) return NextResponse.json({ error: 'sheetId required' }, { status: 400, headers })

    // 0. Naver Ads — search volume (best-effort)
    let searchVolume: NicheSearchSummary | null = null
    let naverError: string | undefined
    if (process.env.NAVER_AD_API_KEY && keyword) {
      try {
        const stats = await getKeywordStats(keyword)
        searchVolume = summarize(stats, 30)
      } catch (e) {
        naverError = e instanceof Error ? e.message : String(e)
        console.error('[explorer/full] Naver Ads failed:', naverError)
      }
    }

    // 1. Sheets — пишем все табы и считаем вердикт
    const { tabs: sheetTabs, verdict } = await writeNicheAnalysis(sheetId, baseName, {
      reviews,
      products,
      tags: safeTags,
      questions: safeQuestions,
      keyword,
      searchVolume,
    })

    // 2. AI analysis — best-effort
    let analysis: AIAnalysis | null = null
    let aiTabs: string[] = []
    let aiError: string | undefined
    if (process.env.ANTHROPIC_API_KEY && reviews.length >= 10) {
      try {
        const productCtx = products.map((p) => ({
          name: p.name,
          price: p.price,
          rating: p.rating,
          reviewCount: p.reviewCount,
        }))
        analysis = await analyzeReviewsAI(reviews, keyword ?? '', safeQuestions, productCtx)
        aiTabs = await writeAIAnalysisToSheet(sheetId, baseName, analysis)
      } catch (e) {
        aiError = e instanceof Error ? e.message : String(e)
        console.error('[scrape/full] AI analysis failed:', aiError)
      }
    }

    const allTabs = [...sheetTabs, ...aiTabs]

    // 3. Persist to DB
    let runId: string | undefined
    try {
      runId = await persistRun({
        keyword: keyword ?? '',
        verdict,
        reviews,
        products,
        tags: safeTags,
        questions: safeQuestions,
        sheetTabs: allTabs,
        analysis,
        searchVolume,
      })
      // Auto-close pending rerun-queue items с тем же keyword.
      if (runId && keyword) {
        try {
          const closed = await linkCompletedRun(keyword, runId)
          if (closed) console.log(`[explorer/full] закрыто ${closed} элементов очереди для "${keyword}"`)
        } catch (e) {
          console.error('[explorer/full] linkCompletedRun failed:', e)
        }
      }
    } catch (e) {
      console.error('[scrape/full] DB persist failed:', e)
    }

    return NextResponse.json(
      {
        runId,
        written: reviews.length,
        productCount: products.length,
        tagCount: safeTags.length,
        questionCount: safeQuestions.length,
        tabs: allTabs,
        verdict,
        searchVolume,
        aiError,
        naverError,
      },
      { headers },
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers })
  }
}
