import { createHmac } from 'crypto'

const BASE = 'https://api.searchad.naver.com'

function makeSignature(timestamp: number, method: string, path: string, secretKey: string) {
  const message = `${timestamp}.${method}.${path}`
  return createHmac('sha256', secretKey).update(message).digest('base64')
}

function adHeaders(method: string, path: string) {
  const ts = Date.now()
  return {
    'X-Timestamp': String(ts),
    'X-API-KEY': process.env.NAVER_AD_API_KEY!,
    'X-Customer': process.env.NAVER_AD_CUSTOMER_ID!,
    'X-Signature': makeSignature(ts, method, path, process.env.NAVER_AD_SECRET_KEY!),
    'Content-Type': 'application/json',
  }
}

export interface KeywordVolume {
  keyword: string
  monthlyPcQcCnt: number | '< 10'
  monthlyMobileQcCnt: number | '< 10'
  monthlyTotalQcCnt: number | '< 10'
}

export interface RelatedKeyword {
  relKeyword: string
  monthlyPcQcCnt: number | '< 10'
  monthlyMobileQcCnt: number | '< 10'
  compIdx: string
  plAvgDepth: number
}

export function getVolume(k: RelatedKeyword): number {
  if (k.monthlyPcQcCnt === '< 10' || k.monthlyMobileQcCnt === '< 10') return 0
  return Number(k.monthlyPcQcCnt) + Number(k.monthlyMobileQcCnt)
}

export async function fetchRelatedKeywords(seed: string): Promise<RelatedKeyword[]> {
  const path = '/keywordstool'
  const qs = `hintKeywords=${encodeURIComponent(seed)}&showDetail=1`
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: adHeaders('GET', path),
  })
  if (!res.ok) return []
  const data = await res.json()
  const list: Array<{
    relKeyword: string
    monthlyPcQcCnt: number | string
    monthlyMobileQcCnt: number | string
    compIdx: string
    plAvgDepth: number
  }> = data.keywordList ?? []

  return list.map(item => ({
    relKeyword: item.relKeyword,
    monthlyPcQcCnt: item.monthlyPcQcCnt === '< 10' ? '< 10' : Number(item.monthlyPcQcCnt),
    monthlyMobileQcCnt: item.monthlyMobileQcCnt === '< 10' ? '< 10' : Number(item.monthlyMobileQcCnt),
    compIdx: item.compIdx ?? '높음',
    plAvgDepth: item.plAvgDepth ?? 0,
  }))
}

export async function fetchKeywordVolumes(keywords: string[]): Promise<KeywordVolume[]> {
  const path = '/keywordstool'
  const normalized = keywords.map(k => k.replace(/\s+/g, ''))
  const qs = `hintKeywords=${encodeURIComponent(normalized.join(','))}&showDetail=1`
  const res = await fetch(`${BASE}${path}?${qs}`, {
    method: 'GET',
    headers: adHeaders('GET', path),
  })
  if (!res.ok) {
    const text = await res.text()
    throw Object.assign(new Error(`Naver Ad API ${res.status}: ${text}`), { status: res.status })
  }
  const data = await res.json()
  const list: Array<{
    relKeyword: string
    monthlyPcQcCnt: number | string
    monthlyMobileQcCnt: number | string
  }> = data.keywordList ?? []

  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  return keywords.map(kw => {
    const found = list.find(item => item.relKeyword === kw || normalize(item.relKeyword) === normalize(kw))
    if (!found) return { keyword: kw, monthlyPcQcCnt: '< 10', monthlyMobileQcCnt: '< 10', monthlyTotalQcCnt: '< 10' }
    const pc = found.monthlyPcQcCnt === '< 10' ? '< 10' : Number(found.monthlyPcQcCnt)
    const mob = found.monthlyMobileQcCnt === '< 10' ? '< 10' : Number(found.monthlyMobileQcCnt)
    const total: number | '< 10' =
      pc === '< 10' || mob === '< 10' ? '< 10' : pc + mob
    return { keyword: kw, monthlyPcQcCnt: pc, monthlyMobileQcCnt: mob, monthlyTotalQcCnt: total }
  })
}
