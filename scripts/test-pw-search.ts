import { chromium } from 'playwright-extra'
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

chromium.use(StealthPlugin())

async function main() {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' },
  })
  const page = await ctx.newPage()

  console.log('Step 1: warm up via homepage')
  const r1 = await page.goto('https://www.coupang.com/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  console.log('Home status:', r1?.status(), 'title:', await page.title())
  await page.waitForTimeout(3000)

  console.log('Step 2: search')
  const url = 'https://www.coupang.com/np/search?q=' + encodeURIComponent('훌라후프')
  const r2 = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  console.log('Search status:', r2?.status())
  await page.waitForTimeout(3000)
  const html = await page.content()
  console.log('HTML len:', html.length, 'title:', await page.title())
  const matches = [...html.matchAll(/\/vp\/products\/(\d+)/g)]
  console.log('Product matches:', matches.length)
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
