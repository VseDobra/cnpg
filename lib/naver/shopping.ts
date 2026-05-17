function naverHeaders() {
  return {
    'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
    'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
  }
}

export interface ShoppingItem {
  title: string
  link: string
  lprice: string
  mallName: string
  category1: string
}

export async function fetchShoppingResults(
  keyword: string,
  display = 20,
): Promise<ShoppingItem[]> {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${display}&sort=sim`
  const res = await fetch(url, { headers: naverHeaders() })
  if (!res.ok) return []
  const data = await res.json()
  return (data.items ?? []) as ShoppingItem[]
}

export interface PriceAnalysis {
  min: number
  max: number
  avg: number
  median: number
  count: number
}

export function analyzePrices(items: ShoppingItem[]): PriceAnalysis | null {
  const prices = items
    .map(i => parseInt(i.lprice))
    .filter(p => p > 0)
    .sort((a, b) => a - b)
  if (!prices.length) return null
  return {
    min: prices[0],
    max: prices[prices.length - 1],
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    median: prices[Math.floor(prices.length / 2)],
    count: prices.length,
  }
}
