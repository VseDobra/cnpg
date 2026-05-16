import { NextRequest, NextResponse } from 'next/server'
import { fetchReturnById } from '@/lib/coupang/returns'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await fetchReturnById(id)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
