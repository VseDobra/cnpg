import crypto from 'node:crypto'

const BASE_URL = 'https://api.searchad.naver.com'

function getCreds() {
  const API_KEY = process.env.NAVER_AD_API_KEY
  const SECRET_KEY = process.env.NAVER_AD_SECRET_KEY
  const CUSTOMER_ID = process.env.NAVER_AD_CUSTOMER_ID
  if (!API_KEY || !SECRET_KEY || !CUSTOMER_ID) {
    throw new Error('Naver Ads creds missing: NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY / NAVER_AD_CUSTOMER_ID')
  }
  return { API_KEY, SECRET_KEY, CUSTOMER_ID }
}

// Naver Ads signs only the path (no query string)
function sign(secret: string, timestamp: string, method: string, path: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${method}.${path}`).digest('base64')
}

async function naverAdsGet<T>(pathOnly: string, query: Record<string, string | number>): Promise<T> {
  const { API_KEY, SECRET_KEY, CUSTOMER_ID } = getCreds()
  const timestamp = String(Date.now())
  const signature = sign(SECRET_KEY, timestamp, 'GET', pathOnly)
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
  const url = `${BASE_URL}${pathOnly}${qs ? `?${qs}` : ''}`
  const res = await fetch(url, {
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': API_KEY,
      'X-Customer': CUSTOMER_ID,
      'X-Signature': signature,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Naver Ads ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export type CompetitionLevel = 'LOW' | 'MED' | 'HIGH' | 'UNKNOWN'

export interface KeywordStat {
  keyword: string
  monthlyPc: number       // -1 if < 10
  monthlyMobile: number   // -1 if < 10
  monthlyTotal: number    // sum (treating <10 as 5)
  avgPcClicks: number
  avgMobileClicks: number
  ctrPc: number
  ctrMobile: number
  adDepth: number         // plAvgDepth — number of ad slots filled, 0–10 ish, higher = more ads competition
  competition: CompetitionLevel
  isSeed: boolean
}

interface NaverKeywordItem {
  relKeyword: string
  monthlyPcQcCnt: number | string
  monthlyMobileQcCnt: number | string
  monthlyAvePcClkCnt?: number
  monthlyAveMobileClkCnt?: number
  monthlyAvePcCtr?: number
  monthlyAveMobileCtr?: number
  plAvgDepth?: number
  compIdx?: string
}

function parseCount(v: number | string | undefined): { val: number; isLt10: boolean } {
  if (v == null) return { val: 0, isLt10: false }
  if (typeof v === 'number') return { val: v, isLt10: false }
  const s = String(v).trim()
  if (s.includes('10') && s.includes('<')) return { val: 5, isLt10: true }
  return { val: parseInt(s.replace(/,/g, ''), 10) || 0, isLt10: false }
}

function mapCompetition(k: string | undefined): CompetitionLevel {
  if (!k) return 'UNKNOWN'
  if (k === '낮음') return 'LOW'
  if (k === '중간') return 'MED'
  if (k === '높음') return 'HIGH'
  return 'UNKNOWN'
}

export async function getKeywordStats(seedKeyword: string): Promise<KeywordStat[]> {
  const data = await naverAdsGet<{ keywordList?: NaverKeywordItem[] }>('/keywordstool', {
    hintKeywords: seedKeyword,
    showDetail: 1,
  })
  const list = data.keywordList ?? []

  return list
    .map((item) => {
      const pc = parseCount(item.monthlyPcQcCnt)
      const mobile = parseCount(item.monthlyMobileQcCnt)
      return {
        keyword: item.relKeyword,
        monthlyPc: pc.isLt10 ? -1 : pc.val,
        monthlyMobile: mobile.isLt10 ? -1 : mobile.val,
        monthlyTotal: pc.val + mobile.val,
        avgPcClicks: Number(item.monthlyAvePcClkCnt ?? 0),
        avgMobileClicks: Number(item.monthlyAveMobileClkCnt ?? 0),
        ctrPc: Number(item.monthlyAvePcCtr ?? 0),
        ctrMobile: Number(item.monthlyAveMobileCtr ?? 0),
        adDepth: Number(item.plAvgDepth ?? 0),
        competition: mapCompetition(item.compIdx),
        isSeed: item.relKeyword === seedKeyword,
      } as KeywordStat
    })
    .sort((a, b) => {
      if (a.isSeed) return -1
      if (b.isSeed) return 1
      return b.monthlyTotal - a.monthlyTotal
    })
}

export interface NicheSearchSummary {
  seedKeyword: string
  seedMonthlyTotal: number
  seedCompetition: CompetitionLevel
  seedAdDepth: number
  relatedCount: number
  relatedTopN: KeywordStat[]
  totalEcosystemSearches: number  // sum of monthly searches across all related
}

export function summarize(stats: KeywordStat[], topN = 30): NicheSearchSummary {
  const seed = stats.find((s) => s.isSeed)
  const related = stats.filter((s) => !s.isSeed)
  return {
    seedKeyword: seed?.keyword ?? '',
    seedMonthlyTotal: seed?.monthlyTotal ?? 0,
    seedCompetition: seed?.competition ?? 'UNKNOWN',
    seedAdDepth: seed?.adDepth ?? 0,
    relatedCount: related.length,
    relatedTopN: related.slice(0, topN),
    totalEcosystemSearches: stats.reduce((s, k) => s + k.monthlyTotal, 0),
  }
}
