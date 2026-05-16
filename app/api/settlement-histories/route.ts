import { NextRequest, NextResponse } from 'next/server'
import { fetchSettlementHistories } from '@/lib/coupang/settlements'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month')
    if (!month) return NextResponse.json({ error: 'month обязателен (YYYY-MM)' }, { status: 400 })
    const data = await fetchSettlementHistories(month)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
