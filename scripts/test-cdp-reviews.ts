import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 5000 })
  const ctx = browser.contexts()[0]
  const pages = ctx.pages()
  let page = pages.find(p => p.url().includes('coupang.com'))
  if (!page) {
    page = await ctx.newPage()
    await page.goto('https://www.coupang.com/', { waitUntil: 'domcontentloaded' })
  }
  console.log('On:', page.url())

  // If not on /np/search, navigate there in-page
  if (!page.url().includes('/np/search')) {
    await page.evaluate(() => { window.location.href = '/np/search?q=' + encodeURIComponent('훌라후프') })
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
    await page.waitForTimeout(1500)
  }
  console.log('Now on:', page.url())

  const r = await page.evaluate(async () => {
    const pid = '2287331'
    const res = await fetch(`/next-api/review?productId=${pid}&page=1&size=20&sortBy=ORDER_SCORE_ASC&ratingSummary=true`, { credentials: 'include' })
    const txt = await res.text()
    return {
      status: res.status,
      length: txt.length,
      first200: txt.slice(0, 200),
    }
  })
  console.log(JSON.stringify(r, null, 2))
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
