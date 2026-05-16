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
