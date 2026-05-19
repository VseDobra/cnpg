import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 5000 })
  const ctx = browser.contexts()[0]
  const pages = ctx.pages()
  let page = pages.find(p => p.url().includes('coupang.com'))
  if (!page) {
    page = await ctx.newPage()
    await page.goto('https://www.coupang.com/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  }
  console.log('Start on:', page.url())

  const kw = '훌라후프'

  // Navigate via in-page JS — gives Sec-Fetch-Site: same-origin
  await page.evaluate((keyword) => {
    window.location.href = `/np/search?q=${encodeURIComponent(keyword)}`
  }, kw)
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
  await page.waitForTimeout(2000)
  console.log('After in-page nav, URL:', page.url())
  const html = await page.content()
  console.log('HTML length:', html.length, 'Title:', await page.title())
  const m = [...html.matchAll(/\/vp\/products\/(\d+)/g)]
  console.log('Product matches:', m.length)
  console.log('First 5 unique:', [...new Set(m.map(x => x[1]))].slice(0, 5))
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
