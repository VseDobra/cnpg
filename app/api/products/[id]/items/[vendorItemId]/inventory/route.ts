import { NextRequest, NextResponse } from 'next/server'
import { fetchItemInventory } from '@/lib/coupang/products'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ vendorItemId: string }> }) {
  try {
    const { vendorItemId } = await params
    const data = await fetchItemInventory(vendorItemId)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
