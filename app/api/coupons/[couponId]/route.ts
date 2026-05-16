import { NextRequest, NextResponse } from 'next/server'
import { expireCoupon } from '@/lib/coupang/coupons'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ couponId: string }> }) {
  try {
    const { couponId } = await params
    await expireCoupon(Number(couponId))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
