import { createHmac } from 'crypto'

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID!
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET!
const NAVER_AD_API_KEY = process.env.NAVER_AD_API_KEY!
const NAVER_AD_SECRET_KEY = process.env.NAVER_AD_SECRET_KEY!
const NAVER_AD_CUSTOMER_ID = process.env.NAVER_AD_CUSTOMER_ID!

function adHeaders(method: string, path: string) {
  const ts = Date.now()
  const sig = createHmac('sha256', NAVER_AD_SECRET_KEY)
    .update(`${ts}.${method}.${path}`)
    .digest('base64')
  return {
    'X-Timestamp': String(ts),
    'X-API-KEY': NAVER_AD_API_KEY,
    'X-Customer': NAVER_AD_CUSTOMER_ID,
    'X-Signature': sig,
    'Content-Type': 'application/json',
  }
}

function naverHeaders() {
  return {
    'X-Naver-Client-Id': NAVER_CLIENT_ID,
    'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    'Content-Type': 'application/json',
  }
}

export async function fetchKeywordVolumes(keywords: string[]) {
  const path = '/keywordstool'
  const qs = `hintKeywords=${encodeURIComponent(keywords.join(','))}&showDetail=1`
  const res = await fetch(`https://api.searchad.naver.com${path}?${qs}`, {
    headers: adHeaders('GET', path),
  })
  const data = await res.json()
  return (data.keywordList ?? []) as Array<{
    relKeyword: string
    monthlyPcQcCnt: number | string
    monthlyMobileQcCnt: number | string
    compIdx: string
    plAvgDepth: number
  }>
}

export async function fetchTrends(keyword: string) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 12)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: naverHeaders(),
    body: JSON.stringify({
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      timeUnit: 'month',
      keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0]?.data as Array<{ period: string; ratio: number }> | undefined
}

export async function fetchShoppingResults(keyword: string, display = 20) {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${display}&sort=sim`
  const res = await fetch(url, { headers: naverHeaders() })
  if (!res.ok) return []
  const data = await res.json()
  return (data.items ?? []) as Array<{
    title: string
    lprice: string
    mallName: string
    category1: string
  }>
}

export function analyzePrices(items: Awaited<ReturnType<typeof fetchShoppingResults>>) {
  const prices = items.map(i => parseInt(i.lprice)).filter(p => p > 0).sort((a, b) => a - b)
  if (!prices.length) return null
  const median = prices[Math.floor(prices.length / 2)]
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
  return { min: prices[0], max: prices[prices.length - 1], avg, median, count: prices.length }
}

export function analyzeTrends(data: Array<{ period: string; ratio: number }> | null | undefined) {
  if (!data || data.length < 4) return null
  const recent3 = data.slice(-3).map(d => d.ratio)
  const prev3 = data.slice(-6, -3).map(d => d.ratio)
  const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length
  const prevAvg = prev3.reduce((a, b) => a + b, 0) / prev3.length || 1
  const change = Math.round(((recentAvg - prevAvg) / prevAvg) * 100)
  const peak = Math.max(...data.map(d => d.ratio))
  const current = data[data.length - 1].ratio
  return { change, peak, current }
}

export function compLabel(idx: string) {
  if (idx === '높음') return 'Высокая'
  if (idx === '중간') return 'Средняя'
  if (idx === '낮음') return 'Низкая'
  return idx
}

export function getVerdict(volume: number, compIdx: string): string {
  if (volume > 50000 && compIdx === '높음') return '🔴 ИЗБЕГАТЬ'
  if (volume > 50000 && compIdx === '중간') return '🟡 ТЕСТИРОВАТЬ'
  if (volume > 20000 && compIdx === '낮음') return '🟢 ЗАПУСКАТЬ'
  if (volume > 10000 && compIdx !== '높음') return '🟡 ТЕСТИРОВАТЬ'
  if (volume < 5000) return '🔴 ИЗБЕГАТЬ'
  return '🟡 ТЕСТИРОВАТЬ'
}

export async function quickResearch(keyword: string) {
  const [volumes, rawTrends, products] = await Promise.all([
    fetchKeywordVolumes([keyword]),
    fetchTrends(keyword),
    fetchShoppingResults(keyword, 20),
  ])
  const main = volumes.find(k => k.relKeyword === keyword) ?? volumes[0]
  const volume = main
    ? (main.monthlyPcQcCnt === '< 10' || main.monthlyMobileQcCnt === '< 10'
        ? 0 : Number(main.monthlyPcQcCnt) + Number(main.monthlyMobileQcCnt))
    : 0
  const comp = main?.compIdx ?? ''
  const trends = analyzeTrends(rawTrends)
  const prices = analyzePrices(products)
  const verdict = getVerdict(volume, comp)

  const topKws = volumes
    .filter(k => {
      const v = k.monthlyPcQcCnt === '< 10' ? 0 : Number(k.monthlyPcQcCnt) + Number(k.monthlyMobileQcCnt)
      return v > 300 && k.compIdx !== '높음'
    })
    .sort((a, b) => {
      const va = a.monthlyPcQcCnt === '< 10' ? 0 : Number(a.monthlyPcQcCnt) + Number(a.monthlyMobileQcCnt as number)
      const vb = b.monthlyPcQcCnt === '< 10' ? 0 : Number(b.monthlyPcQcCnt) + Number(b.monthlyMobileQcCnt as number)
      return vb - va
    })
    .slice(0, 5)

  return { keyword, volume, comp, trends, prices, products, verdict, topKws }
}
