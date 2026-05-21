import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const run = await prisma.scraperRun.findUnique({
    where: { id },
    include: {
      products: { orderBy: [{ searchRank: 'asc' }, { reviewCount: 'desc' }] },
      reviews: { orderBy: [{ helpful: 'desc' }] },
      questions: true,
      tags: true,
      topics: { orderBy: [{ kind: 'asc' }, { rank: 'asc' }] },
    },
  })

  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const parsed = {
    ...run,
    metrics: safeJson(run.metrics, {}),
    reasons: safeJson<string[]>(run.reasons, []),
    sheetTabs: safeJson<string[]>(run.sheetTabs ?? '[]', []),
    searchVolume: safeJson(run.searchVolume ?? 'null', null),
    aiExtended: safeJson(run.aiExtended ?? 'null', null),
    reviews: run.reviews.map((r) => ({ ...r, photos: safeJson<string[]>(r.photos, []) })),
    topics: run.topics.map((t) => ({
      ...t,
      quotes: safeJson<string[]>(t.quotes, []),
      reviewIds: safeJson<string[]>(t.reviewIds, []),
    })),
  }

  return NextResponse.json(parsed)
}

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
