import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Лёгкий preview для hover-карточки на /explorer:
 * 3 фото из отзывов + 1 главный pain + 1 главный positive + цена медиана.
 * Отдельный от /runs/[id] чтобы не тащить весь payload (отзывы могут быть тысячи).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const run = await prisma.scraperRun.findUnique({
    where: { id },
    select: {
      id: true,
      keyword: true,
      verdictText: true,
      productCount: true,
      reviewCount: true,
      products: {
        select: { firstImage: true, price: true },
        take: 100,
      },
      reviews: {
        select: { photos: true },
        where: { photos: { not: '[]' } },
        take: 30,
      },
      topics: {
        select: { kind: true, topic: true, count: true },
        orderBy: [{ kind: 'asc' }, { rank: 'asc' }],
        take: 30,
      },
    },
  })

  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Извлекаем до 3 фото из всех отзывов
  const photos: string[] = []
  for (const r of run.reviews) {
    if (photos.length >= 3) break
    try {
      const arr = JSON.parse(r.photos) as string[]
      for (const u of arr) {
        if (photos.length >= 3) break
        if (typeof u === 'string' && u.startsWith('http')) photos.push(u)
      }
    } catch {}
  }

  // Медиана цены
  const prices = run.products.map((p) => p.price).filter((p) => p > 0).sort((a, b) => a - b)
  const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : 0

  // Топ pain и positive
  const topPain = run.topics.find((t) => t.kind === 'pain')
  const topPositive = run.topics.find((t) => t.kind === 'positive')

  // Первая картинка карточки как fallback
  const productImages = run.products
    .map((p) => p.firstImage)
    .filter((u): u is string => !!u && u.startsWith('http'))
    .slice(0, 3)

  return NextResponse.json({
    id: run.id,
    keyword: run.keyword,
    verdictText: run.verdictText,
    productCount: run.productCount,
    reviewCount: run.reviewCount,
    medianPrice,
    photos: photos.length ? photos : productImages,
    photoSource: photos.length ? 'reviews' : 'listings',
    topPain: topPain ? { topic: topPain.topic, count: topPain.count } : null,
    topPositive: topPositive ? { topic: topPositive.topic, count: topPositive.count } : null,
  })
}
