import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { quickResearch } from '@/lib/naver/research'

export async function GET() {
  const latest = await prisma.nicheOpportunity.findFirst({ orderBy: { scannedAt: 'desc' } })
  if (!latest) return NextResponse.json({ results: [], lastScan: null })

  // Return all records from the same scan session (within 2 hours of the latest record)
  const cutoff = new Date(latest.scannedAt.getTime() - 2 * 60 * 60 * 1000)
  const results = await prisma.nicheOpportunity.findMany({
    where: { scannedAt: { gte: cutoff } },
    orderBy: [{ verdict: 'asc' }, { volume: 'desc' }],
  })
  return NextResponse.json({ results, lastScan: latest.scannedAt })
}

export async function POST(req: NextRequest) {
  const { keyword } = await req.json()
  if (!keyword?.trim()) {
    return NextResponse.json({ error: 'keyword required' }, { status: 400 })
  }
  try {
    const result = await quickResearch(keyword.trim())
    await prisma.researchHistory.create({
      data: {
        keyword: result.keyword,
        volume: result.volume,
        competition: result.competition,
        verdict: result.verdict,
        verdictReason: result.verdictReason,
        trendChange: result.trendChange,
        trendMonths: JSON.stringify(result.trendMonths),
        medianPrice: result.medianPrice,
        minPrice: result.minPrice,
        maxPrice: result.maxPrice,
        topKeywords: JSON.stringify(result.topKeywords),
        competitors: JSON.stringify(result.competitors),
        risks: JSON.stringify(result.risks),
      },
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
