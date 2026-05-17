import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const SRC = 'C:\\Users\\PC\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 1'
const TMP = 'C:\\Users\\PC\\AppData\\Local\\Temp\\chrome-nikita-pw'

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  const SKIP = ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'IndexedDB', 'databases', 'Local Storage', 'Session Storage']
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.includes(entry.name)) continue
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    try {
      if (entry.isDirectory()) copyDir(s, d)
      else fs.copyFileSync(s, d)
    } catch {}
  }
}

async function main() {
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true })

  console.log('Copying Profile 1 (Nikita)...')
  copyDir(SRC, TMP)
  console.log('Done. Launching Chrome...')

  // Need a parent user data dir
  const tmpParent = 'C:\\Users\\PC\\AppData\\Local\\Temp\\chrome-nikita-root'
  if (!fs.existsSync(tmpParent)) fs.mkdirSync(tmpParent, { recursive: true })

  // Copy profile into parent as Default
  const defaultDir = path.join(tmpParent, 'Default')
  if (fs.existsSync(defaultDir)) fs.rmSync(defaultDir, { recursive: true, force: true })
  fs.cpSync(TMP, defaultDir, { recursive: true })

  const browser = await chromium.launchPersistentContext(tmpParent, {
    headless: false,
    channel: 'chrome',
  })

  const page = await browser.newPage()

  console.log('Navigating to coupang.com...')
  await page.goto('https://www.coupang.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })

  const title = await page.title()
  console.log('Page title:', title)

  const h1 = await page.$eval('h1', el => el.textContent).catch(() => 'no h1')
  console.log('H1:', h1)

  await page.waitForTimeout(5000)
  await browser.close()
}

main().catch(console.error)
