import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface RgOrderItem {
  vendorItemId: number
  productName: string
  salesQuantity: number
  unitSalesPrice: string
  currency: string
}

export interface RgOrder {
  orderId: number
  vendorId: string
  paidAt: string
  orderItems: RgOrderItem[]
}

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export async function fetchRgOrders(from: Date, to: Date): Promise<RgOrder[]> {
  const results: RgOrder[] = []
  let nextToken: string | null = null

  do {
    const query = `vendorId=${VENDOR_ID}&paidDateFrom=${fmtDate(from)}&paidDateTo=${fmtDate(to)}${nextToken ? `&nextToken=${nextToken}` : ''}`
    const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${VENDOR_ID}/rg/orders?${query}`
    const res = await coupangRequest<{ data: RgOrder[]; nextToken?: string }>('GET', path)
    results.push(...(res.data ?? []))
    nextToken = res.nextToken ?? null
  } while (nextToken)

  return results
}
