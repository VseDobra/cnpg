import { NextRequest, NextResponse } from 'next/server'
import { writeNicheAnalysis, type Review, type Product } from '@/lib/google/sheets-analysis'
import { analyzeReviewsAI, writeAIAnalysisToSheet } from '@/lib/google/sheets-ai'

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

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get('origin'))
  const body = await req.json().catch(() => ({}))
  const { reviews, products, sheetId, sheetName, keyword } = body as {
    reviews?: Review[]
    products?: Product[]
    sheetId?: string
    sheetName?: string
    keyword?: string
  }

  if (!sheetId) return NextResponse.json({ error: 'sheetId required' }, { status: 400, headers })
  if (!Array.isArray(reviews)) return NextResponse.json({ error: 'reviews array required' }, { status: 400, headers })
  if (!Array.isArray(products)) return NextResponse.json({ error: 'products array required' }, { status: 400, headers })

  const baseName = (sheetName?.trim()) || `${keyword?.trim() || 'niche'}_${new Date().toISOString().slice(0, 10)}`

  try {
    const result = await writeNicheAnalysis(sheetId, baseName, { reviews, products, keyword })

    // AI analysis (pains/positives) — best-effort; не валим всё если упадёт
    let aiTabs: string[] = []
    let aiError: string | undefined
    if (process.env.ANTHROPIC_API_KEY && reviews.length >= 10) {
      try {
        const analysis = await analyzeReviewsAI(reviews, keyword ?? '')
        aiTabs = await writeAIAnalysisToSheet(sheetId, baseName, analysis)
      } catch (e) {
        aiError = e instanceof Error ? e.message : String(e)
        console.error('[scrape/full] AI analysis failed:', aiError)
      }
    }

    return NextResponse.json(
      {
        written: reviews.length,
        productCount: products.length,
        tabs: [...result.tabs, ...aiTabs],
        verdict: result.verdict,
        aiError,
      },
      { headers },
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers })
  }
}
