import { NextResponse } from 'next/server'
import { fetchCategoryTree, flattenCategories } from '@/lib/coupang/categories'

export async function GET() {
  try {
    const tree = await fetchCategoryTree()
    const flat = flattenCategories(tree)
    return NextResponse.json(flat)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
