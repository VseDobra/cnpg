import { NextRequest, NextResponse } from 'next/server'
import { fetchProductByExternalSku } from '@/lib/coupang/products'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sku: string }> }) {
  try {
    const { sku } = await params
    const data = await fetchProductByExternalSku(sku)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
