import { NextRequest, NextResponse } from 'next/server'
import { fetchCoupons, createCoupon } from '@/lib/coupang/coupons'

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status') ?? 'APPLIED'
    const data = await fetchCoupons(status)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const requestedId = await createCoupon(body)
    return NextResponse.json({ requestedId })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
