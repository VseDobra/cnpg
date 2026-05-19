import { chromium, type BrowserContext, type Page } from 'playwright'

export interface Review {
  productId: string
  productName: string
  reviewId: string
  rating: number
  date: string
  reviewer: string
  helpful: number
  title: string
  content: string
}

export interface ProgressEvent {
  type: 'search' | 'product-start' | 'product-done' | 'product-error' | 'log'
  productId?: string
  productName?: string
  reviewCount?: number
  index?: number
  total?: number
  ids?: string[]
  message?: string
}

export const CDP_URL = 'http://localhost:9222'

async function connect(): Promise<BrowserContext> {
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 })
  const contexts = browser.contexts()
  return contexts[0] ?? (await browser.newContext())
}


export async function searchProductIds(
  page: Page,
  keyword: string,
  limit: number,
): Promise<string[]> {
  const ids: string[] = []
  const seen = new Set<string>()
  for (let p = 1; p <= 5 && ids.length < limit; p++) {
    if (p > 1) await page.waitForTimeout(4000) // back off between pages
    const target = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&page=${p}`

    let html = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      const stamp = Date.now()
      const stampedTarget = `${target}&_=${stamp}`
      const navPromise = page.waitForURL((u) => u.toString().includes(`_=${stamp}`), { timeout: 30000 })
      await page.evaluate((href) => { window.location.href = href }, stampedTarget)
      await navPromise
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
      await page.waitForTimeout(1500)
      html = await page.content()
      if (html.length > 5000 && !html.includes('RET9999')) break
      console.log(`[scrape] page ${p} attempt ${attempt}: blocked (len=${html.length}), retry in 6s`)
      await page.waitForTimeout(6000)
    }

    const matches = [...html.matchAll(/\/vp\/products\/(\d+)/g)]
    console.log(`[scrape] page ${p}: matches=${matches.length}`)
    if (matches.length === 0) break // search exhausted or blocked
    for (const m of matches) {
      if (seen.has(m[1])) continue
      seen.add(m[1])
      ids.push(m[1])
      if (ids.length >= limit) break
    }
  }
  return ids
}

async function fetchReviewsInPage(page: Page, productId: string): Promise<Review[]> {
  return (await page.evaluate(async (pid: string) => {
    const out: Review[] = []
    type Row = Record<string, unknown>

    const collect = (contents: Row[] = []) => {
      for (const r of contents) {
        out.push({
          productId: pid,
          productName: String(r.itemName ?? ''),
          reviewId: String(r.reviewId ?? ''),
          rating: Number(r.rating ?? 0),
          date: r.reviewAt
            ? new Date(Number(r.reviewAt)).toISOString().slice(0, 10)
            : '',
          reviewer: String(r.displayName ?? ''),
          helpful: Number(r.helpfulTrueCount ?? 0),
          title: String(r.title ?? ''),
          content: String(r.content ?? ''),
        })
      }
    }

    const first = await fetch(
      `/next-api/review?productId=${pid}&page=1&size=20&sortBy=ORDER_SCORE_ASC&ratingSummary=true`,
      { credentials: 'include' },
    )
    const fd = (await first.json()) as { rData?: { paging?: { contents?: Row[]; totalPage?: number } } }
    const paging = fd?.rData?.paging
    if (!paging) return out
    collect(paging.contents ?? [])
    const totalPage = paging.totalPage ?? 1

    for (let p = 2; p <= totalPage; p++) {
      await new Promise((r) => setTimeout(r, 250))
      const res = await fetch(
        `/next-api/review?productId=${pid}&page=${p}&size=20&sortBy=ORDER_SCORE_ASC`,
        { credentials: 'include' },
      )
      const d = (await res.json()) as { rData?: { paging?: { contents?: Row[] } } }
      collect(d?.rData?.paging?.contents ?? [])
    }
    return out
  }, productId)) as Review[]
}

export async function checkCdp(): Promise<boolean> {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

export async function scrapeCoupang(
  keyword: string,
  limit: number,
  onProgress: (e: ProgressEvent) => void,
): Promise<Review[]> {
  const ctx = await connect()
  const all: Review[] = []

  let createdPage = false
  let page: Page
  const existing = ctx.pages().find((p) => p.url().includes('coupang.com'))
  if (existing) {
    page = existing
    onProgress({ type: 'log', message: `Используем открытую вкладку coupang.com...` })
  } else {
    page = await ctx.newPage()
    createdPage = true
    onProgress({ type: 'log', message: `Открываем coupang.com...` })
    await page.goto('https://www.coupang.com/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(1500)
  }
  try {
    onProgress({ type: 'log', message: `Ищем «${keyword}»...` })
    const ids = await searchProductIds(page, keyword, limit)
    onProgress({ type: 'search', ids, total: ids.length })
    if (!ids.length) return all

    // After search, we're on /np/search — review fetches work from here.
    // Sequential to stay under Coupang rate limits.
    for (let i = 0; i < ids.length; i++) {
      const pid = ids[i]
      onProgress({ type: 'product-start', productId: pid, index: i, total: ids.length })
      try {
        const reviews = await fetchReviewsInPage(page, pid)
        all.push(...reviews)
        onProgress({
          type: 'product-done',
          productId: pid,
          productName: reviews[0]?.productName ?? pid,
          reviewCount: reviews.length,
          index: i,
        })
      } catch (e) {
        onProgress({
          type: 'product-error',
          productId: pid,
          index: i,
          message: e instanceof Error ? e.message : String(e),
        })
      }
      await new Promise((r) => setTimeout(r, 300))
    }
  } finally {
    if (createdPage) await page.close().catch(() => {})
  }
  return all
}

