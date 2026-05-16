import { NextRequest, NextResponse } from 'next/server'
import { fetchCouponsByOrderId } from '@/lib/coupang/coupons'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await fetchCouponsByOrderId(id)
  return NextResponse.json(data)
}
