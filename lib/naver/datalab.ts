const BASE = 'https://openapi.naver.com/v1/datalab/shopping'

function naverHeaders() {
  return {
    'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
    'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
    'Content-Type': 'application/json',
  }
}

export interface KeywordTrendPoint {
  period: string
  ratio: number
}

export interface KeywordTrendResult {
  title: string
  data: KeywordTrendPoint[]
}

export interface KeywordTrendsResponse {
  startDate: string
  endDate: string
  timeUnit: string
  results: KeywordTrendResult[]
}

export async function fetchKeywordTrends(params: {
  startDate: string
  endDate: string
  timeUnit: 'date' | 'week' | 'month'
  category: string
  keyword: Array<{ name: string; param: string[] }>
}): Promise<KeywordTrendsResponse> {
  const res = await fetch(`${BASE}/category/keywords`, {
    method: 'POST',
    headers: naverHeaders(),
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = Object.assign(new Error(`Naver API ${res.status}`), { status: res.status })
    throw err
  }
  return res.json()
}

export interface TopKeywordEntry {
  keyword: string
  ratio: number
}

export interface TopKeywordsResponse {
  startDate: string
  endDate: string
  timeUnit: string
  results: Array<{
    title: string
    data: TopKeywordEntry[]
  }>
}

export interface SearchTrendPoint {
  period: string
  ratio: number
}

export async function fetchSearchTrends(keyword: string): Promise<SearchTrendPoint[] | null> {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 12)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate: fmt(start),
      endDate: fmt(end),
      timeUnit: 'month',
      keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return (data.results?.[0]?.data ?? null) as SearchTrendPoint[] | null
}

export async function fetchTopKeywords(params: {
  startDate: string
  endDate: string
  timeUnit: 'date' | 'week' | 'month'
  category: string
}): Promise<TopKeywordsResponse> {
  const res = await fetch(`${BASE}/category/keyword/ratio`, {
    method: 'POST',
    headers: naverHeaders(),
    body: JSON.stringify({
      startDate: params.startDate,
      endDate: params.endDate,
      timeUnit: params.timeUnit,
      category: params.category,
    }),
  })
  if (!res.ok) {
    const err = Object.assign(new Error(`Naver API ${res.status}`), { status: res.status })
    throw err
  }
  return res.json()
}
