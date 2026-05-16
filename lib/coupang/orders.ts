import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface CoupangOrder {
  orderId: string
  status: string
  orderedAt: string
  shipByDate?: string
  totalPrice: number
  receiver: { name: string; addr1: string; addr2: string }
  orderItems: Array<{
    vendorItemId: string
    productName: string
    quantity: number
    unitPrice: number
  }>
}

export async function fetchOrders(createdAtFrom: string, createdAtTo: string) {
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/ordersheets?createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=INSTRUCT&maxPerPage=50`
  const res = await coupangRequest<{ data: CoupangOrder[] }>('GET', path)
  return res.data ?? []
}

export interface OrderReceiver {
  name: string
  addr1: string
  addr2: string
  postCode?: string
}

export async function fetchOrderReceiver(orderId: string): Promise<OrderReceiver | null> {
  try {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/ordersheets/${orderId}`
    const res = await coupangRequest<{ data: { receiver?: OrderReceiver } }>('GET', path)
    return res.data?.receiver ?? null
  } catch {
    return null
  }
}
