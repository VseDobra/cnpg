import { prisma } from './db'
import { fetchOrders } from './coupang/orders'
import { fetchProducts } from './coupang/products'
import { fetchSettlements } from './coupang/settlements'
import { fetchReturns } from './coupang/returns'
import { fetchRgInventory } from './coupang/inventory'
import { fetchRgOrders } from './coupang/rg_orders'

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export async function runSync() {
  console.log('[sync] Starting sync at', new Date().toISOString())

  const now = new Date()
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  try {
    const orders = await fetchOrders(formatDate(from), formatDate(now))
    for (const o of orders) {
      await prisma.order.upsert({
        where: { id: o.orderId },
        create: {
          id: o.orderId,
          status: o.status,
          orderedAt: new Date(o.orderedAt),
          shipByDate: o.shipByDate ? new Date(o.shipByDate) : null,
          totalPrice: o.totalPrice,
          receiverName: o.receiver.name,
          receiverAddress: `${o.receiver.addr1} ${o.receiver.addr2}`,
          items: {
            create: o.orderItems.map(item => ({
              productId: item.vendorItemId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          },
        },
        update: {
          status: o.status,
          shipByDate: o.shipByDate ? new Date(o.shipByDate) : null,
        },
      })
    }
    await prisma.syncLog.create({ data: { type: 'orders', status: 'ok', message: `${orders.length} orders` } })

    const products = await fetchProducts()
    for (const p of products) {
      const existing = await prisma.product.findUnique({ where: { id: p.sellerProductId }, select: { salePrice: true } })
      await prisma.product.upsert({
        where: { id: p.sellerProductId },
        create: { id: p.sellerProductId, name: p.sellerProductName, status: p.statusName, salePrice: p.salePrice, imageUrl: p.imageUrl || null },
        update: {
          name: p.sellerProductName, status: p.statusName, salePrice: p.salePrice,
          ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
        },
      })
      if (!existing || existing.salePrice !== p.salePrice) {
        await prisma.priceHistory.create({ data: { productId: p.sellerProductId, price: p.salePrice } })
      }
      for (const item of (p.items ?? [])) {
        if (!item.vendorItemId) continue
        await prisma.inventory.upsert({
          where: { productId: p.sellerProductId },
          create: { productId: p.sellerProductId, vendorItemId: item.vendorItemId, quantity: 0, updatedAt: now },
          update: { vendorItemId: item.vendorItemId, updatedAt: now },
        })
      }
    }
    await prisma.syncLog.create({ data: { type: 'products', status: 'ok', message: `${products.length} products` } })

    // RG inventory: real stock quantities + sales count
    try {
      const rgItems = await fetchRgInventory()
      for (const item of rgItems) {
        const vid = String(item.vendorItemId)
        await prisma.inventory.updateMany({
          where: { vendorItemId: vid },
          data: {
            quantity: item.inventoryDetails?.totalOrderableQuantity ?? 0,
            salesLast30Days: item.salesCountMap?.SALES_COUNT_LAST_THIRTY_DAYS ?? 0,
            updatedAt: now,
          },
        })
      }
      await prisma.syncLog.create({ data: { type: 'rg_inventory', status: 'ok', message: `${rgItems.length} items` } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.syncLog.create({ data: { type: 'rg_inventory', status: 'error', message: msg } })
    }

    try {
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const settlements = await fetchSettlements(month)
      for (const s of settlements) {
        await prisma.settlement.upsert({
          where: { id: s.remittanceId },
          create: {
            id: s.remittanceId,
            settledAt: new Date(s.remittanceDate),
            amount: s.paymentAmount,
            commission: s.commissionAmount,
            netAmount: s.paymentAmount - s.commissionAmount,
          },
          update: {},
        })
      }
      await prisma.syncLog.create({ data: { type: 'settlements', status: 'ok', message: `${settlements.length} settlements` } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.syncLog.create({ data: { type: 'settlements', status: 'error', message: msg } })
      console.error('[sync] Settlements error:', msg)
    }

    try {
      const returns = await fetchReturns(formatDate(from), formatDate(now))
      for (const r of returns) {
        await prisma.return.upsert({
          where: { id: String(r.receiptId) },
          create: {
            id: String(r.receiptId),
            orderId: String(r.orderId),
            reason: r.returnType ?? '',
            status: r.status ?? '',
            requestedAt: new Date(r.createdAt),
          },
          update: { status: r.status ?? '' },
        })
      }
      await prisma.syncLog.create({ data: { type: 'returns', status: 'ok', message: `${returns.length} returns` } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.syncLog.create({ data: { type: 'returns', status: 'error', message: msg } })
      console.error('[sync] Returns error:', msg)
    }

    // RG orders: real paid orders with product and price details
    try {
      const rgFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const rgOrders = await fetchRgOrders(rgFrom, now)
      for (const o of rgOrders) {
        const paidAt = new Date(Number(o.paidAt))
        const totalPrice = o.orderItems.reduce((s, i) => s + Math.round(parseFloat(i.unitSalesPrice) * i.salesQuantity), 0)
        await prisma.order.upsert({
          where: { id: String(o.orderId) },
          create: {
            id: String(o.orderId),
            status: 'DELIVERED',
            orderedAt: paidAt,
            totalPrice,
            receiverName: '',
            receiverAddress: '',
            items: {
              create: o.orderItems.map(item => ({
                productId: String(item.vendorItemId),
                productName: item.productName,
                quantity: item.salesQuantity,
                unitPrice: Math.round(parseFloat(item.unitSalesPrice)),
              })),
            },
          },
          update: { totalPrice },
        })
      }
      await prisma.syncLog.create({ data: { type: 'rg_orders', status: 'ok', message: `${rgOrders.length} orders` } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.syncLog.create({ data: { type: 'rg_orders', status: 'error', message: msg } })
      console.error('[sync] RG orders error:', msg)
    }

    console.log('[sync] Done')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.syncLog.create({ data: { type: 'all', status: 'error', message } })
    console.error('[sync] Error:', message)
  }
}
