import { NextRequest, NextResponse } from 'next/server'
import { fetchRelatedKeywords, getVolume } from '@/lib/naver/searchad'

export async function POST(req: NextRequest) {
  const { keyword } = await req.json()
  if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 })

  try {
    const related = await fetchRelatedKeywords(keyword)
    const results = related
      .sort((a, b) => getVolume(b) - getVolume(a))
      .map(k => ({
        keyword: k.relKeyword,
        volume: getVolume(k),
        competition: k.compIdx,
      }))
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
