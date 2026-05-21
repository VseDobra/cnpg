export interface VerdictReview {
  rating: number
}

export interface VerdictProduct {
  price: number
  rating: number
  reviewCount: number
  seller: string
  isRocket: boolean
}

export interface Verdict {
  level: 'GO' | 'MAYBE' | 'SKIP'
  emoji: string
  text: string
  reasons: string[]
  metrics: Record<string, number | string>
}

const median = (arr: number[]) => {
  const a = arr.filter((n) => Number.isFinite(n) && n > 0).slice().sort((x, y) => x - y)
  if (!a.length) return 0
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

const avg = (arr: number[]) => {
  const a = arr.filter((n) => Number.isFinite(n) && n > 0)
  return a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0
}

export function computeVerdict(products: VerdictProduct[], reviews: VerdictReview[]): Verdict {
  const prices = products.map((p) => p.price)
  const ratings = products.map((p) => p.rating)
  const reviewCounts = products.map((p) => p.reviewCount)
  const totalReviews = reviewCounts.reduce((s, n) => s + n, 0)
  const top3Reviews = reviewCounts.slice().sort((a, b) => b - a).slice(0, 3).reduce((s, n) => s + n, 0)
  const concentrationTop3 = totalReviews > 0 ? top3Reviews / totalReviews : 0

  const sellers = new Set(products.map((p) => p.seller).filter(Boolean))
  const rocketShare = products.filter((p) => p.isRocket).length / Math.max(1, products.length)
  const medPrice = median(prices)
  const avgRating = avg(ratings)
  const medReviews = median(reviewCounts)

  const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const r of reviews) {
    const k = Math.max(1, Math.min(5, Math.round(r.rating)))
    dist[k]++
  }
  const totalDist = Object.values(dist).reduce((s, n) => s + n, 0)
  const negShare = totalDist ? (dist[1] + dist[2]) / totalDist : 0

  const reasons: string[] = []
  let goScore = 0

  if (products.length >= 15) { goScore++; reasons.push(`✓ ${products.length} активных листингов`) }
  else reasons.push(`⚠️ только ${products.length} листингов — рынок узкий`)

  if (medReviews >= 30) { goScore++; reasons.push(`✓ медиана ${medReviews} отзывов — спрос есть`) }
  else if (medReviews >= 10) reasons.push(`〜 медиана ${medReviews} отзывов — спрос слабый`)
  else reasons.push(`✗ медиана ${medReviews} отзывов — нет спроса`)

  if (avgRating < 4.5 && negShare > 0.05) { goScore++; reasons.push(`✓ средний рейтинг ${avgRating.toFixed(2)}, негатив ${(negShare * 100).toFixed(0)}% — есть куда давить`) }
  else if (avgRating >= 4.7) reasons.push(`✗ средний рейтинг ${avgRating.toFixed(2)} — конкуренты делают слишком хорошо`)
  else reasons.push(`〜 средний рейтинг ${avgRating.toFixed(2)}`)

  if (medPrice >= 10000) { goScore++; reasons.push(`✓ медиана цены ${medPrice.toLocaleString()}₩ — нормальная маржа`) }
  else if (medPrice >= 5000) reasons.push(`〜 медиана цены ${medPrice.toLocaleString()}₩ — тонкая маржа`)
  else reasons.push(`✗ медиана цены ${medPrice.toLocaleString()}₩ — нет маржи`)

  if (concentrationTop3 < 0.5) { goScore++; reasons.push(`✓ ТОП-3 держат ${(concentrationTop3 * 100).toFixed(0)}% отзывов — рынок не закрыт`) }
  else if (concentrationTop3 < 0.7) reasons.push(`〜 ТОП-3 держат ${(concentrationTop3 * 100).toFixed(0)}% — концентрация средняя`)
  else reasons.push(`✗ ТОП-3 держат ${(concentrationTop3 * 100).toFixed(0)}% — олигополия`)

  const level: 'GO' | 'MAYBE' | 'SKIP' = goScore >= 4 ? 'GO' : goScore >= 2 ? 'MAYBE' : 'SKIP'
  const emoji = level === 'GO' ? '🟢' : level === 'MAYBE' ? '🟡' : '🔴'

  return {
    level,
    emoji,
    text: `${emoji} ${level} (${goScore}/5)`,
    reasons,
    metrics: {
      products: products.length,
      sellers: sellers.size,
      medianPrice: medPrice,
      avgRating: Number(avgRating.toFixed(2)),
      medianReviewCount: medReviews,
      totalReviewsCollected: reviews.length,
      negativeShare: Number((negShare * 100).toFixed(1)),
      top3Concentration: Number((concentrationTop3 * 100).toFixed(1)),
      rocketShare: Number((rocketShare * 100).toFixed(1)),
    },
  }
}

/**
 * Извлекает sub-категорию (4-й уровень) из breadcrumb вида:
 *   "HOME > KAN > 반려/애완용품 > 고양이용품 > 스크래쳐"
 * Возвращает "고양이용품" — наиболее полезный уровень для группировки.
 * Если breadcrumb короткий, возвращает последний значимый сегмент.
 */
export function extractCategoryBucket(category: string): string {
  if (!category) return '(без категории)'
  const parts = category.split(' > ').map((s) => s.trim()).filter(Boolean)
  const skip = new Set(['HOME', 'KAN'])
  const filtered = parts.filter((p) => !skip.has(p))
  if (filtered.length === 0) return '(без категории)'
  return filtered[1] ?? filtered[0]
}
