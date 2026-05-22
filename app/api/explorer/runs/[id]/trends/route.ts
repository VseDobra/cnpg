import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fetchGoogleTrends } from '@/lib/google/trends'

export const runtime = 'nodejs'
export const maxDuration = 120

export interface NaverTrendsResult {
  keyword: string
  points: { period: string; ratio: number }[]
  peakMonth: { period: string; ratio: number } | null
  troughMonth: { period: string; ratio: number } | null
  seasonality: 'highly_seasonal' | 'seasonal' | 'stable' | 'unknown'
  yoyChange: number | null
  generatedAt: string
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await prisma.scraperRun.findUnique({ where: { id } })
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 })
  if (!run.keyword) {
    return NextResponse.json({ error: 'у прогона нет keyword' }, { status: 400 })
  }

  const end = new Date()
  const start = new Date()
  start.setFullYear(end.getFullYear() - 1)
  start.setDate(1)

  try {
    const trendsRaw = await fetchGoogleTrends(
      [run.keyword],
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
      'KR',
    )
    const points = trendsRaw[0]?.data ?? []

    if (!points.length) {
      return NextResponse.json(
        { error: 'Google Trends не вернул данных для этого ключевика' },
        { status: 422 },
      )
    }

    const sortedByRatio = [...points].sort((a, b) => b.ratio - a.ratio)
    const peak = sortedByRatio[0]
    const trough = sortedByRatio[sortedByRatio.length - 1]
    const max = peak?.ratio ?? 0
    const min = trough?.ratio ?? 0
    const ratio = min > 0 ? max / min : 999
    const seasonality: NaverTrendsResult['seasonality'] =
      ratio >= 4 ? 'highly_seasonal' : ratio >= 2 ? 'seasonal' : 'stable'

    // YoY: compare last 3 months to same 3 months a year earlier — if available
    let yoyChange: number | null = null
    if (points.length >= 12) {
      const last3 = points.slice(-3).reduce((s, p) => s + p.ratio, 0) / 3
      const prev3 = points.slice(0, 3).reduce((s, p) => s + p.ratio, 0) / 3
      if (prev3 > 0) yoyChange = Number((((last3 - prev3) / prev3) * 100).toFixed(0))
    }

    const result: NaverTrendsResult = {
      keyword: run.keyword,
      points,
      peakMonth: peak ?? null,
      troughMonth: trough ?? null,
      seasonality,
      yoyChange,
      generatedAt: new Date().toISOString(),
    }

    await prisma.scraperRun.update({
      where: { id },
      data: { naverTrends: JSON.stringify(result) },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
