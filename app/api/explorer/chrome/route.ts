import { NextRequest } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { checkCdp } from '@/lib/scraper/coupang-pw'

export const runtime = 'nodejs'

const PROFILE_DIR = 'C:\\Users\\PC\\AppData\\Local\\Temp\\coupang-scraper-chrome'

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

function findChrome(): string | null {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p
  return null
}

export async function GET() {
  const ok = await checkCdp()
  return Response.json({ running: ok })
}

export async function POST(req: NextRequest) {
  const { reset } = (await req.json().catch(() => ({}))) as { reset?: boolean }

  if (reset && fs.existsSync(PROFILE_DIR)) {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true })
  }

  if (!reset && (await checkCdp())) return Response.json({ running: true, started: false })

  const chrome = findChrome()
  if (!chrome) {
    return Response.json({ error: 'Chrome не найден в стандартных путях' }, { status: 500 })
  }

  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })

  const child = spawn(
    chrome,
    [
      '--remote-debugging-port=9222',
      `--user-data-dir=${PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      'https://www.coupang.com/',
    ],
    { detached: true, stdio: 'ignore' },
  )
  child.unref()

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await checkCdp()) return Response.json({ running: true, started: true })
  }
  return Response.json({ error: 'Chrome запустился, но CDP недоступен' }, { status: 500 })
}
