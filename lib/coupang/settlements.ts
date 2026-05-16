import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface CoupangSettlement {
  remittanceId: string
  remittanceDate: string
  paymentAmount: number
  commissionAmount: number
}

export async function fetchSettlements(month: string) {
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/feeinvoices?targetMonth=${month}`
  const res = await coupangRequest<{ data: CoupangSettlement[] }>('GET', path)
  return res.data ?? []
}

export interface SettlementHistory {
  settlementType: string
  settlementDate: string
  revenueRecognitionYearMonth: string
  revenueRecognitionDateFrom: string
  revenueRecognitionDateTo: string
  totalSale: number
  serviceFee: number
  settlementTargetAmount: number
  settlementAmount: number
  lastAmount: number
  pendingReleasedAmount: number
  sellerDiscountCoupon: number
  downloadableCoupon: number
  sellerServiceFee: number
  couranteeFee: number
  couranteeCustomerReward: number
  deductionAmount: number
  debtOfLastWeek: number
  finalAmount: number
  bankAccountHolder: string
  bankName: string
  bankAccount: string
  status: 'DONE' | 'SUBJECT'
  storeFeeDiscount: number
}

export async function fetchSettlementHistories(revenueRecognitionYearMonth: string): Promise<SettlementHistory[]> {
  const qs = new URLSearchParams({ revenueRecognitionYearMonth }).toString()
  const res = await coupangRequest<SettlementHistory[]>(
    'GET',
    `/v2/providers/marketplace_openapi/apis/api/v1/settlement-histories?${qs}`
  )
  return Array.isArray(res) ? res : []
}
