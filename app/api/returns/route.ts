import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const analytics = searchParams.get('analytics') === '1'

  const returns = await prisma.return.findMany({ orderBy: { requestedAt: 'desc' } })

  if (!analytics) return NextResponse.json(returns)

  // Return rate by product (via orderId → orderItems)
  const orderIds = [...new Set(returns.map(r => r.orderId))]
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: { items: true },
  })
  const orderMap = Object.fromEntries(orders.map(o => [o.id, o]))

  const productReturns: Record<string, { name: string; returns: number; revenue: number }> = {}
  for (const r of returns) {
    const order = orderMap[r.orderId]
    if (!order) continue
    for (const item of order.items) {
      if (!productReturns[item.productName]) {
        productReturns[item.productName] = { name: item.productName, returns: 0, revenue: 0 }
      }
      productReturns[item.productName].returns++
      productReturns[item.productName].revenue += item.unitPrice * item.quantity
    }
  }

  // Top reasons
  const reasonMap: Record<string, number> = {}
  for (const r of returns) {
    const reason = r.reason || 'Не указана'
    reasonMap[reason] = (reasonMap[reason] || 0) + 1
  }
  const topReasons = Object.entries(reasonMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }))

  // Monthly trend
  const monthMap: Record<string, number> = {}
  for (const r of returns) {
    const key = r.requestedAt.toISOString().slice(0, 7)
    monthMap[key] = (monthMap[key] || 0) + 1
  }
  const monthlyTrend = Object.entries(monthMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, count]) => ({ month, count }))

  return NextResponse.json({
    returns,
    analytics: {
      total: returns.length,
      topReasons,
      monthlyTrend,
      byProduct: Object.values(productReturns).sort((a, b) => b.returns - a.returns).slice(0, 5),
    },
  })
}
