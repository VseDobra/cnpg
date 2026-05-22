import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { groupTopics, type TopicWithRun } from '@/lib/explorer/topic-grouping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const kind = (searchParams.get('kind') ?? 'pain') as 'pain' | 'positive' | 'fear'
  const minNiches = Math.max(1, Number(searchParams.get('minNiches') ?? '2') || 2)

  const topics = await prisma.scrapedTopic.findMany({
    where: { kind },
    select: { topic: true, count: true, runId: true },
  })

  if (topics.length === 0) {
    return NextResponse.json({ groups: [], allNiches: [], totals: { rawTopics: 0, totalNiches: 0 } })
  }

  const runIds = Array.from(new Set(topics.map((t) => t.runId)))
  const runs = await prisma.scraperRun.findMany({
    where: { id: { in: runIds } },
    select: { id: true, keyword: true, scrapedAt: true, verdictLevel: true },
  })
  const runMap = new Map(runs.map((r) => [r.id, r]))

  const items: TopicWithRun[] = topics.flatMap((t) => {
    const r = runMap.get(t.runId)
    if (!r) return []
    return [{ runId: t.runId, keyword: r.keyword, topic: t.topic, count: t.count }]
  })

  const groups = groupTopics(items).filter((g) => g.niches.length >= minNiches)

  const allNiches = runs
    .map((r) => ({ id: r.id, keyword: r.keyword, scrapedAt: r.scrapedAt, verdictLevel: r.verdictLevel }))
    .sort((a, b) => a.keyword.localeCompare(b.keyword))

  return NextResponse.json({
    groups,
    allNiches,
    totals: {
      rawTopics: topics.length,
      totalNiches: runs.length,
    },
  })
}
