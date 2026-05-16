import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createProduct } from '@/lib/coupang/products'

export async function GET() {
  const products = await prisma.product.findMany({ orderBy: { updatedAt: 'desc' } })
  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sellerProductId = await createProduct(body)
    return NextResponse.json({ sellerProductId })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
