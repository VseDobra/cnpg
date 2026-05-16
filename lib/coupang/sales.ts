import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface SaleDeliveryFee {
  amount: number
  fee: number
  feeVat: number
  feeRatio: number
  settlementAmount: number
}

export interface SaleItem {
  taxType: string
  productId: number
  productName: string
  vendorItemId: number
  vendorItemName: string
  salePrice: number
  quantity: number
  coupangDiscountCoupon: number
  saleAmount: number
  sellerDiscountCoupon: number
  downloadableCoupon: number
  serviceFee: number
  serviceFeeVat: number
  serviceFeeRatio: number
  settlementAmount: number
  externalSellerSkuCode: string
}

export interface SaleRecord {
  orderId: number
  saleType: 'SALE' | 'REFUND'
  saleDate: string
  recognitionDate: string
  settlementDate: string
  finalSettlementDate: string
  deliveryFee: SaleDeliveryFee
  items: SaleItem[]
}

export interface SalesHistoryResponse {
  data: SaleRecord[]
  hasNext: boolean
  nextToken: string
}

export async function fetchSalesHistory(params: {
  recognitionDateFrom: string
  recognitionDateTo: string
  token?: string
  maxPerPage?: number
}): Promise<SalesHistoryResponse> {
  const { recognitionDateFrom, recognitionDateTo, token = '', maxPerPage = 50 } = params
  const qs = new URLSearchParams({
    vendorId: VENDOR_ID,
    recognitionDateFrom,
    recognitionDateTo,
    token,
    maxPerPage: String(maxPerPage),
  }).toString()

  const res = await coupangRequest<{ code: number; message: string; data: SaleRecord[]; hasNext: boolean; nextToken: string }>(
    'GET',
    `/v2/providers/openapi/apis/api/v1/revenue-history?${qs}`
  )
  return { data: res.data ?? [], hasNext: res.hasNext, nextToken: res.nextToken }
}
