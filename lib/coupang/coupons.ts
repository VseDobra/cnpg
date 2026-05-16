import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface Contract {
  contractId: number
  type: string
  start: string
  end: string
  sellerShareRatio: number
}

export interface Coupon {
  couponId: number
  contractId: number
  promotionName: string | null
  status: string
  type: string
  discount: number
  maxDiscountPrice: number
  startAt: string
  endAt: string
  wowExclusive: string
}

export async function fetchContracts(): Promise<Contract[]> {
  const res = await coupangRequest<{ data: { content: Contract[] } }>(
    'GET',
    `/v2/providers/fms/apis/api/v2/vendors/${VENDOR_ID}/contract/list`
  )
  return res.data.content ?? []
}

export async function fetchCoupons(status = 'APPLIED'): Promise<Coupon[]> {
  const res = await coupangRequest<{ data: { content: Coupon[] } }>(
    'GET',
    `/v2/providers/fms/apis/api/v2/vendors/${VENDOR_ID}/coupons?status=${status}&page=1&size=50&sort=desc`
  )
  return res.data.content ?? []
}

export interface CreateCouponParams {
  contractId: number
  name: string
  discount: number
  maxDiscountPrice: number
  startAt: string
  endAt: string
  type: 'RATE' | 'PRICE' | 'FIXED_WITH_QUANTITY'
}

export async function createCoupon(params: CreateCouponParams): Promise<string> {
  const res = await coupangRequest<{ data: { content: { requestedId: string } } }>(
    'POST',
    `/v2/providers/fms/apis/api/v2/vendors/${VENDOR_ID}/coupon`,
    {
      contractId: String(params.contractId),
      name: params.name,
      discount: String(params.discount),
      maxDiscountPrice: String(params.maxDiscountPrice),
      startAt: params.startAt,
      endAt: params.endAt,
      type: params.type,
      wowExclusive: 'false',
    }
  )
  return res.data.content.requestedId
}

export async function addCouponItems(couponId: number, vendorItemIds: number[]): Promise<string> {
  const res = await coupangRequest<{ data: { content: { requestedId: string } } }>(
    'POST',
    `/v2/providers/fms/apis/api/v1/vendors/${VENDOR_ID}/coupons/${couponId}/items`,
    { vendorItems: vendorItemIds }
  )
  return res.data.content.requestedId
}

export async function expireCoupon(couponId: number): Promise<void> {
  await coupangRequest(
    'PUT',
    `/v2/providers/fms/apis/api/v1/vendors/${VENDOR_ID}/coupons/${couponId}?action=expire`
  )
}

export interface RequestStatus {
  couponId: number
  requestedId: string
  type: string
  status: 'REQUESTED' | 'DONE' | 'FAIL'
  total: number
  succeeded: number
  failed: number
  failedVendorItems: Array<{ vendorItemId: number; reason: string }>
}

export interface OrderCoupon {
  couponId: number
  vendorItemId: number
  promotionName: string
  discount: number
  maxDiscountPrice: number
  type: string
  status: string
  startAt: string
  endAt: string
}

export async function fetchCouponsByOrderId(orderId: string): Promise<OrderCoupon[]> {
  try {
    const res = await coupangRequest<{ data: { content: OrderCoupon[] } }>(
      'GET',
      `/v2/providers/fms/apis/api/v2/vendors/${VENDOR_ID}/${orderId}/coupons`
    )
    return res.data?.content ?? []
  } catch {
    return []
  }
}

export async function fetchRequestStatus(requestedId: string): Promise<RequestStatus> {
  const res = await coupangRequest<{ data: { content: RequestStatus } }>(
    'GET',
    `/v2/providers/fms/apis/api/v1/vendors/${VENDOR_ID}/requested/${requestedId}`
  )
  return res.data.content
}
