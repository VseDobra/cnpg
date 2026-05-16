import { NextRequest, NextResponse } from 'next/server'
import { requestProductApproval } from '@/lib/coupang/products'

export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await requestProductApproval(id)
    return NextResponse.json({ ok: true, data: result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
