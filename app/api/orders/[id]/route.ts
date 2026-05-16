import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fetchOrderReceiver } from '@/lib/coupang/orders'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const vendorItemIds = order.items.map(i => i.productId)
  const inventories = await prisma.inventory.findMany({ where: { vendorItemId: { in: vendorItemIds } } })
  const productIds = inventories.map(i => i.productId)
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } })

  const vidToImage: Record<string, string> = {}
  for (const inv of inventories) {
    const product = products.find(p => p.id === inv.productId)
    if (product?.imageUrl) vidToImage[inv.vendorItemId] = product.imageUrl
  }

  let receiverName = order.receiverName
  let receiverAddress = order.receiverAddress

  if (!receiverName && !receiverAddress) {
    const receiver = await fetchOrderReceiver(id)
    if (receiver) {
      receiverName = receiver.name
      receiverAddress = [receiver.addr1, receiver.addr2].filter(Boolean).join(' ')
      await prisma.order.update({
        where: { id },
        data: { receiverName, receiverAddress },
      })
    }
  }

  return NextResponse.json({
    ...order,
    receiverName,
    receiverAddress,
    items: order.items.map(item => ({ ...item, imageUrl: vidToImage[item.productId] ?? null })),
  })
}
