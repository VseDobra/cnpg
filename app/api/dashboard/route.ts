import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const prevFrom = new Date(from.getTime() - days * 24 * 60 * 60 * 1000)

  // Today / yesterday boundaries (UTC)
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1)

  // This week / last week (Mon–Sun UTC)
  const dow = todayStart.getUTCDay()
  const daysSinceMon = dow === 0 ? 6 : dow - 1
  const thisWeekStart = new Date(todayStart)
  thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - daysSinceMon)
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7)

  const [orders, prevOrders, inventory, products, returns, recentOrders, todayOrders, yesterdayOrders, thisWeekOrders, lastWeekOrders] = await Promise.all([
    prisma.order.findMany({ where: { orderedAt: { gte: from } }, include: { items: true } }),
    prisma.order.findMany({ where: { orderedAt: { gte: prevFrom, lt: from } }, include: { items: true } }),
    prisma.inventory.findMany(),
    prisma.product.findMany(),
    prisma.return.findMany({ where: { requestedAt: { gte: from } } }),
    prisma.order.findMany({ orderBy: { orderedAt: 'desc' }, take: 5, include: { items: true } }),
    prisma.order.findMany({ where: { orderedAt: { gte: todayStart } } }),
    prisma.order.findMany({ where: { orderedAt: { gte: yesterdayStart, lt: todayStart } } }),
    prisma.order.findMany({ where: { orderedAt: { gte: thisWeekStart } } }),
    prisma.order.findMany({ where: { orderedAt: { gte: lastWeekStart, lt: thisWeekStart } } }),
  ])

  const revenue = orders.reduce((s, o) => s + o.totalPrice, 0)
  const prevRevenue = prevOrders.reduce((s, o) => s + o.totalPrice, 0)
  const unitsSold = orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0)
  const prevUnitsSold = prevOrders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0)

  const avgOrderValue = orders.length > 0 ? Math.round(revenue / orders.length) : 0
  const prevAvgOrderValue = prevOrders.length > 0 ? Math.round(prevRevenue / prevOrders.length) : 0

  const todayRevenue = todayOrders.reduce((s, o) => s + o.totalPrice, 0)
  const yesterdayRevenue = yesterdayOrders.reduce((s, o) => s + o.totalPrice, 0)
  const thisWeekRevenue = thisWeekOrders.reduce((s, o) => s + o.totalPrice, 0)
  const lastWeekRevenue = lastWeekOrders.reduce((s, o) => s + o.totalPrice, 0)

  // Daily sales chart
  const dailySales: Record<string, number> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    dailySales[d.toISOString().split('T')[0]] = 0
  }
  for (const o of orders) {
    const key = o.orderedAt.toISOString().split('T')[0]
    if (key in dailySales) dailySales[key] += o.totalPrice
  }

  // Day-of-week heatmap (0=Mon..6=Sun)
  const dowSales = Array(7).fill(0)
  const dowCounts = Array(7).fill(0)
  for (const o of orders) {
    const jsDay = o.orderedAt.getDay() // 0=Sun
    const dow = jsDay === 0 ? 6 : jsDay - 1 // convert to Mon=0
    dowSales[dow] += o.totalPrice
    dowCounts[dow]++
  }

  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  const inventoryByVendorItemId = Object.fromEntries(inventory.map(i => [i.vendorItemId, i.productId]))

  // Daily profit (only items with cost price set)
  const dailyProfit: Record<string, number> = {}
  for (const key of Object.keys(dailySales)) dailyProfit[key] = 0

  // Per-product breakdown with cost price and profit
  const statsMap: Record<string, { name: string; imageUrl: string | null; revenue: number; cost: number; couponDiscount: number; commission: number; adRate: number; taxRate: number; rgDelivery: number; orderIds: Set<string>; quantity: number }> = {}
  for (const o of orders) {
    for (const item of o.items) {
      if (!statsMap[item.productId]) {
        const sellerProductId = inventoryByVendorItemId[item.productId]
        const prod = sellerProductId ? productMap[sellerProductId] : null
        statsMap[item.productId] = {
          name: item.productName,
          imageUrl: prod?.imageUrl ?? null,
          revenue: 0,
          cost: prod?.costPrice ?? 0,
          couponDiscount: prod?.couponDiscount ?? 0,
          commission: prod?.commission ?? 10.8,
          adRate: prod?.adRate ?? 5,
          taxRate: prod?.taxRate ?? 10,
          rgDelivery: prod?.rgDelivery ?? 0,
          orderIds: new Set(),
          quantity: 0,
        }
      }
      statsMap[item.productId].revenue += item.unitPrice * item.quantity
      statsMap[item.productId].orderIds.add(o.id)
      statsMap[item.productId].quantity += item.quantity

      // Accumulate daily profit
      const dayKey = o.orderedAt.toISOString().split('T')[0]
      if (dayKey in dailyProfit) {
        const s = statsMap[item.productId]
        if (s.cost > 0) {
          const net = item.unitPrice - s.couponDiscount
          const profitPerUnit = net - Math.round(net * s.commission / 100) - Math.round(net * s.adRate / 100) - Math.round(net * s.taxRate / 100) - s.rgDelivery - s.cost
          dailyProfit[dayKey] += profitPerUnit * item.quantity
        }
      }
    }
  }
  const productBreakdown = Object.values(statsMap)
    .map(p => {
      if (p.cost === 0) return { name: p.name, imageUrl: p.imageUrl, revenue: p.revenue, orderCount: p.orderIds.size, quantity: p.quantity, profit: null, margin: null }
      const netPerUnit = (price: number) => {
        const net = price - p.couponDiscount
        return net - Math.round(net * p.commission / 100) - Math.round(net * p.adRate / 100) - Math.round(net * p.taxRate / 100) - p.rgDelivery - p.cost
      }
      const avgPrice = p.revenue / p.quantity
      const profitPerUnit = netPerUnit(Math.round(avgPrice))
      const profit = Math.round(profitPerUnit * p.quantity)
      const margin = p.revenue > 0 ? Math.round((profit / p.revenue) * 100) : 0
      return { name: p.name, imageUrl: p.imageUrl, revenue: p.revenue, orderCount: p.orderIds.size, quantity: p.quantity, profit, margin }
    })
    .sort((a, b) => b.revenue - a.revenue)

  // Net profit (only products with cost price set)
  const netProfit = productBreakdown.reduce((s, p) => s + (p.profit ?? 0), 0)
  const hasCostData = products.some(p => p.costPrice > 0)

  return NextResponse.json({
    kpis: {
      revenue,
      prevRevenue,
      orderCount: orders.length,
      prevOrderCount: prevOrders.length,
      unitsSold,
      prevUnitsSold,
      returnCount: returns.length,
      prevReturnCount: 0,
      netProfit,
      hasCostData,
      avgOrderValue,
      prevAvgOrderValue,
      todayRevenue,
      yesterdayRevenue,
      thisWeekRevenue,
      lastWeekRevenue,
    },
    dailySales: Object.entries(dailySales).map(([date, amount]) => ({ date, amount, profit: dailyProfit[date] ?? 0 })),
    dowSales: dowSales.map((amount, i) => ({
      day: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][i],
      amount,
      orders: dowCounts[i],
    })),
    recentOrders: recentOrders.map(o => {
      const firstItem = o.items[0]
      const productId = firstItem ? inventoryByVendorItemId[firstItem.productId] : undefined
      const imageUrl = productId ? (productMap[productId]?.imageUrl ?? null) : null
      return {
        id: o.id,
        product: firstItem?.productName ?? '—',
        amount: o.totalPrice,
        date: o.orderedAt.toISOString().split('T')[0],
        status: o.status,
        imageUrl,
      }
    }),
    productBreakdown,
    inventory: inventory.map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      salesLast30Days: i.salesLast30Days,
      productName: productMap[i.productId]?.name ?? i.productId,
      imageUrl: productMap[i.productId]?.imageUrl ?? null,
    })),
  })
}
