import { NextResponse } from 'next/server'
import { runDailyScan } from '@/lib/naver/research'

export async function POST() {
  try {
    await runDailyScan()
    return NextResponse.json({ ok: true, scannedAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
