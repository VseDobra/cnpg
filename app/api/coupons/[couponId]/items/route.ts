import { NextRequest, NextResponse } from 'next/server'
import { addCouponItems } from '@/lib/coupang/coupons'

export async function POST(req: NextRequest, { params }: { params: Promise<{ couponId: string }> }) {
  try {
    const { couponId } = await params
    const { vendorItemIds } = await req.json()
    const requestedId = await addCouponItems(Number(couponId), vendorItemIds)
    return NextResponse.json({ requestedId })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
