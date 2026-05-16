import { NextResponse } from 'next/server'
import { fetchInflowStatus } from '@/lib/coupang/products'

export async function GET() {
  try {
    const data = await fetchInflowStatus()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
