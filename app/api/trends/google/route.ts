import { NextRequest, NextResponse } from 'next/server'
import { fetchGoogleTrends } from '@/lib/google/trends'

export async function POST(req: NextRequest) {
  try {
    const { keywords, startDate, endDate } = await req.json()
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'keywords required' }, { status: 400 })
    }
    const results = await fetchGoogleTrends(keywords, startDate, endDate)
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
