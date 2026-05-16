import { NextRequest, NextResponse } from 'next/server'
import { fetchSalesHistory } from '@/lib/coupang/sales'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const recognitionDateFrom = searchParams.get('recognitionDateFrom')
    const recognitionDateTo = searchParams.get('recognitionDateTo')
    const token = searchParams.get('token') ?? ''
    const maxPerPage = Number(searchParams.get('maxPerPage') ?? '50')

    if (!recognitionDateFrom || !recognitionDateTo) {
      return NextResponse.json({ error: 'recognitionDateFrom и recognitionDateTo обязательны' }, { status: 400 })
    }

    const data = await fetchSalesHistory({ recognitionDateFrom, recognitionDateTo, token, maxPerPage })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
