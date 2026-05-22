import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { scanForReruns } from '@/lib/explorer/rerun-scan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const items = await prisma.rerunQueueItem.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  // Подмешиваем sheetTabs из исходного прогона, чтобы UI мог предложить sheetName
  const ids = items.map((i) => i.runId)
  const runs = ids.length
    ? await prisma.scraperRun.findMany({
        where: { id: { in: ids } },
        select: { id: true, sheetTabs: true, verdictText: true, scrapedAt: true, reviewCount: true, productCount: true },
      })
    : []
  const runMap = new Map(runs.map((r) => [r.id, r]))
  return NextResponse.json({
    items: items.map((i) => {
      const r = runMap.get(i.runId)
      let lastSheet = ''
      if (r?.sheetTabs) {
        try {
          const arr = JSON.parse(r.sheetTabs) as string[]
          // Восстанавливаем «базу»: убираем __summary, __reviews и т.п.
          const first = arr[0] ?? ''
          lastSheet = first.replace(/__(summary|products|reviews|top_reviews|titles|photos|qa|coupang_tags|pains|positives|pre_fears)$/, '')
        } catch {}
      }
      return {
        id: i.id,
        runId: i.runId,
        keyword: i.keyword,
        createdAt: i.createdAt,
        reason: i.reason,
        suggestedSheetName: lastSheet,
        prevVerdict: r?.verdictText ?? null,
        prevScrapedAt: r?.scrapedAt ?? null,
        prevReviewCount: r?.reviewCount ?? null,
        prevProductCount: r?.productCount ?? null,
      }
    }),
  })
}

export async function POST() {
  const result = await scanForReruns()
  return NextResponse.json(result)
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.rerunQueueItem.update({
    where: { id },
    data: { status: 'dismissed' },
  })
  return NextResponse.json({ ok: true })
}
