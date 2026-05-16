import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface CoupangReturn {
  receiptId: number
  orderId: number
  returnType: string
  status: string
  createdAt: string
}

export interface ReturnItem {
  vendorItemId: number
  vendorItemName: string
  cancelCount: number
  purchaseCount: number
  sellerProductId: number
  sellerProductName: string
  releaseStatus: string
}

export interface ReturnDelivery {
  deliveryCompanyCode: string
  deliveryInvoiceNo: string
}

export interface ReturnDetail {
  receiptId: number
  orderId: number
  receiptStatus: string
  createdAt: string
  modifiedAt: string
  requesterName: string
  requesterPhoneNumber: string
  requesterAddress: string
  requesterAddressDetail: string
  requesterZipCode: string
  cancelReasonCategory1: string
  cancelReasonCategory2: string
  cancelReason: string
  cancelCountSum: number
  returnDeliveryType: string
  faultByType: string
  preRefund: boolean
  completeConfirmType: string
  completeConfirmDate: string
  reasonCodeText: string
  returnShippingCharge: { units: number; nanos: number }
  returnItems: ReturnItem[]
  returnDeliveryDtos: ReturnDelivery[]
}

export async function fetchReturns(from: string, to: string): Promise<CoupangReturn[]> {
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/returnRequests`
  const query = `createdAtFrom=${from}&createdAtTo=${to}&status=UC`
  const fullPath = `${path}?${query}`
  const res = await coupangRequest<{ data: CoupangReturn[] }>('GET', fullPath)
  return res.data ?? []
}

export async function fetchReturnById(receiptId: string): Promise<ReturnDetail | null> {
  try {
    const path = `/v2/providers/openapi/apis/api/v6/vendors/${VENDOR_ID}/returnRequests/${receiptId}`
    const res = await coupangRequest<{ data: ReturnDetail[] }>('GET', path)
    return res.data?.[0] ?? null
  } catch {
    return null
  }
}
