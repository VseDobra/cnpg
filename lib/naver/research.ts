import { fetchRelatedKeywords, getVolume } from './searchad'
import { fetchShoppingResults, analyzePrices } from './shopping'
import { fetchSearchTrends, type SearchTrendPoint } from './datalab'

// ── Seed keywords (no-cert categories) ───────────────────────────────────────

export const SEED_KEYWORDS = [
  // 수납/정리 (хранение)
  '수납함', '정리함', '서랍정리', '옷걸이', '행거',
  // 캠핑 (кемпинг)
  '캠핑의자', '캠핑테이블', '캠핑랜턴', '텐트팩', '캠핑매트',
  // 자동차용품 (автотовары)
  '차량용방향제', '차량수납', '트렁크정리', '주차번호판', '차량청소',
  // 홈오피스 (домашний офис)
  '모니터받침대', '키보드받침대', '케이블정리', '독서대', '마우스패드',
  // 스포츠 (спорт)
  '요가매트', '폼롤러', '줄넘기', '아령', '운동밴드',
  // 반려동물 (зоотовары)
  '강아지장난감', '고양이장난감', '펫빗', '강아지옷', '고양이터널',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function analyzeTrends(data: SearchTrendPoint[] | null): {
  change: number
  peak: number
  current: number
  months: number[]
} | null {
  if (!data || data.length < 4) return null
  const recent3 = data.slice(-3).map(d => d.ratio)
  const prev3 = data.slice(-6, -3).map(d => d.ratio)
  const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length
  const prevAvg = prev3.reduce((a, b) => a + b, 0) / prev3.length || 1
  return {
    change: Math.round(((recentAvg - prevAvg) / prevAvg) * 100),
    peak: Math.max(...data.map(d => d.ratio)),
    current: data[data.length - 1].ratio,
    months: data.map(d => d.ratio),
  }
}

function getVerdict(
  volume: number,
  comp: string,
  trends: ReturnType<typeof analyzeTrends>,
): { verdict: 'LAUNCH' | 'TEST' | 'AVOID'; reason: string } {
  if (volume > 50000 && comp === '높음')
    return { verdict: 'AVOID', reason: 'Огромный спрос, но рынок перегрет — очень высокая конкуренция' }
  if (volume > 50000 && comp === '중간')
    return { verdict: 'TEST', reason: 'Высокий спрос со средней конкуренцией — есть шанс при сильном листинге' }
  if (volume > 20000 && comp === '낮음')
    return { verdict: 'LAUNCH', reason: 'Хороший спрос при низкой конкуренции — отличная возможность' }
  if (volume > 10000 && comp !== '높음')
    return { verdict: 'TEST', reason: 'Умеренный спрос, конкуренция управляемая' }
  if (volume < 5000)
    return { verdict: 'AVOID', reason: 'Слишком низкий объём поиска — рынок слишком мал' }
  return { verdict: 'TEST', reason: 'Средний спрос — требует дополнительной проверки' }
}

function buildRisks(
  volume: number,
  comp: string,
  trends: ReturnType<typeof analyzeTrends>,
  prices: ReturnType<typeof analyzePrices>,
): string[] {
  const risks: string[] = []
  if (comp === '높음') risks.push('Высокая конкуренция — нужен уникальный листинг или нишевый вариант')
  if (trends && trends.current < trends.peak * 0.5) risks.push('Сезонный товар — сейчас не пик спроса')
  if (prices && prices.min < 5000) risks.push('Есть очень дешёвые конкуренты — ценовое давление снизу')
  if (volume > 100000) risks.push('Очень широкая ниша — сложно ранжироваться без рекламы')
  return risks
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ResearchResult {
  keyword: string
  volume: number
  competition: string
  verdict: 'LAUNCH' | 'TEST' | 'AVOID'
  verdictReason: string
  trendChange: number | null
  trendMonths: number[]
  medianPrice: number | null
  minPrice: number | null
  maxPrice: number | null
  topKeywords: Array<{ keyword: string; volume: number; competition: string }>
  competitors: Array<{ title: string; price: number; mall: string }>
  risks: string[]
}

// ── quickResearch ─────────────────────────────────────────────────────────────

export async function quickResearch(keyword: string): Promise<ResearchResult> {
  const [relatedKws, shoppingItems, rawTrends] = await Promise.all([
    fetchRelatedKeywords(keyword),
    fetchShoppingResults(keyword, 20),
    fetchSearchTrends(keyword),
  ])

  const main = relatedKws.find(k => k.relKeyword === keyword) ?? relatedKws[0]
  const volume = main ? getVolume(main) : 0
  const competition = main?.compIdx ?? '높음'
  const trends = analyzeTrends(rawTrends)
  const { verdict, reason } = getVerdict(volume, competition, trends)
  const prices = analyzePrices(shoppingItems)

  const topKeywords = relatedKws
    .filter(k => getVolume(k) > 300 && k.compIdx !== '높음')
    .sort((a, b) => getVolume(b) - getVolume(a))
    .slice(0, 5)
    .map(k => ({ keyword: k.relKeyword, volume: getVolume(k), competition: k.compIdx }))

  return {
    keyword,
    volume,
    competition,
    verdict,
    verdictReason: reason,
    trendChange: trends?.change ?? null,
    trendMonths: trends?.months ?? [],
    medianPrice: prices?.median ?? null,
    minPrice: prices?.min ?? null,
    maxPrice: prices?.max ?? null,
    topKeywords,
    competitors: shoppingItems.slice(0, 5).map(p => ({
      title: p.title.replace(/<[^>]+>/g, '').slice(0, 45),
      price: parseInt(p.lprice),
      mall: p.mallName,
    })),
    risks: buildRisks(volume, competition, trends, prices),
  }
}

// ── runDailyScan ──────────────────────────────────────────────────────────────

export async function runDailyScan(): Promise<void> {
  const { prisma } = await import('@/lib/db')

  await prisma.nicheOpportunity.deleteMany({
    where: { scannedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  })
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  await prisma.nicheOpportunity.deleteMany({ where: { scannedAt: { gte: today } } })

  console.log(`[discover] Scanning ${SEED_KEYWORDS.length} keywords...`)

  for (const keyword of SEED_KEYWORDS) {
    try {
      const result = await quickResearch(keyword)
      if (result.verdict === 'AVOID') continue
      await prisma.nicheOpportunity.create({
        data: {
          keyword: result.keyword,
          volume: result.volume,
          competition: result.competition,
          verdict: result.verdict,
          trendChange: result.trendChange,
          medianPrice: result.medianPrice,
          topKeywords: JSON.stringify(result.topKeywords),
        },
      })
      console.log(`[discover] ${result.verdict === 'LAUNCH' ? '🟢' : '🟡'} ${keyword} (${result.volume.toLocaleString()}/мес)`)
    } catch (e) {
      console.error(`[discover] Failed: ${keyword}`, e)
    }
  }

  console.log('[discover] Daily scan complete')
}
