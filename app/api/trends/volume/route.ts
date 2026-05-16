import { NextRequest, NextResponse } from 'next/server'
import { fetchKeywordVolumes, type KeywordVolume } from '@/lib/naver/searchad'

const cache = new Map<string, { data: KeywordVolume[]; expiresAt: number }>()
const TTL = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  if (!process.env.NAVER_AD_API_KEY || !process.env.NAVER_AD_SECRET_KEY) {
    return NextResponse.json({ error: 'Добавь NAVER_AD_API_KEY и NAVER_AD_SECRET_KEY в .env.local' }, { status: 503 })
  }

  const { keywords } = await req.json() as { keywords: string[] }
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json({ error: 'keywords required' }, { status: 400 })
  }

  const cacheKey = keywords.slice().sort().join(',')
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  try {
    const data = await fetchKeywordVolumes(keywords)
    cache.set(cacheKey, { data, expiresAt: Date.now() + TTL })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const status = (e as { status?: number }).status
    return NextResponse.json({ error: String(e) }, { status: status ?? 500 })
  }
}
