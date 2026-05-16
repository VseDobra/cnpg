import { NextRequest, NextResponse } from 'next/server'
import { fetchRequestStatus } from '@/lib/coupang/coupons'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ requestedId: string }> }) {
  try {
    const { requestedId } = await params
    const data = await fetchRequestStatus(requestedId)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
