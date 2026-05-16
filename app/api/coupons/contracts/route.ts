import { NextResponse } from 'next/server'
import { fetchContracts } from '@/lib/coupang/coupons'

export async function GET() {
  try {
    const data = await fetchContracts()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
