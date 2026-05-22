import { prisma } from '../db'

const STALE_DAYS = 7
const TOP_N = 3

/**
 * Сканирует ScraperRun, ищет MAYBE-прогоны старше STALE_DAYS, берёт топ-3
 * по числу отзывов (наиболее «прокачанные» ниши) и кладёт их в RerunQueueItem.
 * Дубликаты (тот же runId уже в pending) пропускаются.
 */
export async function scanForReruns(): Promise<{ enqueued: number; skipped: number }> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - STALE_DAYS)

  const candidates = await prisma.scraperRun.findMany({
    where: {
      verdictLevel: 'MAYBE',
      scrapedAt: { lt: cutoff },
    },
    orderBy: [{ reviewCount: 'desc' }, { scrapedAt: 'desc' }],
    take: TOP_N * 4, // запас на случай если часть уже в очереди
    select: { id: true, keyword: true },
  })

  let enqueued = 0
  let skipped = 0
  for (const c of candidates) {
    if (enqueued >= TOP_N) break
    const existing = await prisma.rerunQueueItem.findFirst({
      where: { runId: c.id, status: 'pending' },
      select: { id: true },
    })
    if (existing) { skipped++; continue }
    await prisma.rerunQueueItem.create({
      data: {
        runId: c.id,
        keyword: c.keyword,
        reason: `MAYBE-прогон старше ${STALE_DAYS} дней`,
      },
    })
    enqueued++
  }
  console.log(`[rerun-scan] enqueued=${enqueued} skipped=${skipped}`)
  return { enqueued, skipped }
}

/**
 * При создании нового ScraperRun — закрываем pending-элементы очереди с тем же keyword.
 */
export async function linkCompletedRun(keyword: string, newRunId: string): Promise<number> {
  if (!keyword) return 0
  const res = await prisma.rerunQueueItem.updateMany({
    where: { keyword, status: 'pending' },
    data: { status: 'completed', completedRunId: newRunId, completedAt: new Date() },
  })
  return res.count
}
