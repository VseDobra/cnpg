import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { quickResearch } from '@/lib/naver/research'

export async function GET() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const results = await prisma.nicheOpportunity.findMany({
    where: { scannedAt: { gte: today } },
    orderBy: [{ verdict: 'asc' }, { volume: 'desc' }],
  })
  const lastScan = results[0]?.scannedAt ?? null
  return NextResponse.json({ results, lastScan })
}

export async function POST(req: NextRequest) {
  const { keyword } = await req.json()
  if (!keyword?.trim()) {
    return NextResponse.json({ error: 'keyword required' }, { status: 400 })
  }
  try {
    const result = await quickResearch(keyword.trim())
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
