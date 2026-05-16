import { NextRequest, NextResponse } from 'next/server'
import { updateItemPrice } from '@/lib/coupang/products'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ vendorItemId: string }> }) {
  try {
    const { vendorItemId } = await params
    const { price } = await req.json()
    if (!price || price < 10) return NextResponse.json({ error: 'Минимальная цена 10 вон, шаг 10 вон' }, { status: 400 })
    await updateItemPrice(vendorItemId, Math.round(price / 10) * 10)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
