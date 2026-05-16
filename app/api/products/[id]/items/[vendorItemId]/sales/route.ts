import { NextRequest, NextResponse } from 'next/server'
import { suspendProductItem, resumeProductItem } from '@/lib/coupang/products'

type Params = { params: Promise<{ vendorItemId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { vendorItemId } = await params
    await suspendProductItem(vendorItemId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(_req: NextRequest, { params }: Params) {
  try {
    const { vendorItemId } = await params
    await resumeProductItem(vendorItemId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
