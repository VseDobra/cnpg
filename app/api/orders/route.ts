import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status')
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { orderedAt: 'desc' },
    take: 100,
    include: { items: true },
  })

  const vendorItemIds = [...new Set(orders.flatMap(o => o.items.map(i => i.productId)))]
  const inventories = await prisma.inventory.findMany({ where: { vendorItemId: { in: vendorItemIds } } })
  const productIds = [...new Set(inventories.map(i => i.productId))]
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } })

  const vidToImage: Record<string, string> = {}
  for (const inv of inventories) {
    const product = products.find(p => p.id === inv.productId)
    if (product?.imageUrl) vidToImage[inv.vendorItemId] = product.imageUrl
  }

  return NextResponse.json(orders.map(o => ({
    ...o,
    items: o.items.map(item => ({ ...item, imageUrl: vidToImage[item.productId] ?? null })),
  })))
}
