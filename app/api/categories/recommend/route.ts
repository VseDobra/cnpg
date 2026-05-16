import { NextRequest, NextResponse } from 'next/server'
import { fetchCategoryRecommendation } from '@/lib/coupang/categories'

export async function POST(req: NextRequest) {
  try {
    const { productName, brand } = await req.json()
    if (!productName) return NextResponse.json({ error: 'productName required' }, { status: 400 })
    const data = await fetchCategoryRecommendation(productName, brand)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
