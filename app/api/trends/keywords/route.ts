import { NextRequest, NextResponse } from 'next/server'

interface TrendPoint { period: string; ratio: number }
interface TrendResult { title: string; data: TrendPoint[] }
interface TrendResponse { startDate: string; endDate: string; timeUnit: string; results: TrendResult[]; rateLimited?: boolean }

const cache = new Map<string, { data: TrendResponse; expiresAt: number }>()
const TTL = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Добавь NAVER_CLIENT_ID и NAVER_CLIENT_SECRET в .env.local' },
      { status: 503 },
    )
  }

  const body = await req.json()
  const { startDate, endDate, timeUnit, keyword } = body
  const keywords: Array<{ name: string }> = keyword ?? []

  const cacheKey = `search|${keywords.map(k => k.name).join(',')}|${startDate}|${endDate}|${timeUnit}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  try {
    const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit,
        keywordGroups: keywords.map(k => ({ groupName: k.name, keywords: [k.name] })),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      if (res.status === 429 && cached) {
        return NextResponse.json({ ...cached.data, rateLimited: true })
      }
      return NextResponse.json({ error: `Naver API ${res.status}: ${text}` }, { status: res.status })
    }

    const raw = await res.json()
    const data: TrendResponse = {
      startDate: raw.startDate,
      endDate: raw.endDate,
      timeUnit: raw.timeUnit,
      results: (raw.results ?? []).map((r: { title?: string; groupName?: string; data: TrendPoint[] }) => ({
        title: r.title ?? r.groupName ?? '',
        data: r.data,
      })),
    }

    cache.set(cacheKey, { data, expiresAt: Date.now() + TTL })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
