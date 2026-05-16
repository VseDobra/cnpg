import { NextRequest, NextResponse } from 'next/server'
import { fetchCategoryMeta } from '@/lib/coupang/categories'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  try {
    const meta = await fetchCategoryMeta(Number(code))
    return NextResponse.json(meta)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
