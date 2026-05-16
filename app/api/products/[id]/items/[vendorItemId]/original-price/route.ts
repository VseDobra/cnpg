import { NextRequest, NextResponse } from 'next/server'
import { updateItemOriginalPrice } from '@/lib/coupang/products'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ vendorItemId: string }> }) {
  try {
    const { vendorItemId } = await params
    const { price } = await req.json()
    if (price === undefined || price < 0) return NextResponse.json({ error: 'Цена не может быть отрицательной' }, { status: 400 })
    await updateItemOriginalPrice(vendorItemId, Math.round(price / 10) * 10)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
