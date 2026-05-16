import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const inventory = await prisma.inventory.findMany({ orderBy: { updatedAt: 'desc' } })
  const productIds = inventory.map(i => i.productId)
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } })
  const productMap = Object.fromEntries(products.map(p => [p.id, p]))

  return NextResponse.json(inventory.map(i => ({
    productId: i.productId,
    vendorItemId: i.vendorItemId,
    quantity: i.quantity,
    salesLast30Days: i.salesLast30Days,
    updatedAt: i.updatedAt,
    productName: productMap[i.productId]?.name ?? i.productId,
    imageUrl: productMap[i.productId]?.imageUrl ?? null,
  })))
}
