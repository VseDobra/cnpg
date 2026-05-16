import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface InquiryComment {
  inquiryCommentId: number
  inquiryId: number
  content: string
  inquiryCommentAt: string
}

export interface Inquiry {
  inquiryId: number
  productId: number
  sellerProductId: number
  sellerItemId: number
  vendorItemId: number
  content: string
  inquiryAt: string
  orderIds: number[]
  commentDtoList: InquiryComment[]
}

export interface InquiryPagination {
  currentPage: number
  totalPages: number
  totalElements: number
  countPerPage: number
}

export interface InquiryListResponse {
  content: Inquiry[]
  pagination: InquiryPagination
}

export async function fetchInquiries(params: {
  inquiryStartAt: string
  inquiryEndAt: string
  answeredType?: 'ALL' | 'ANSWERED' | 'NOANSWER'
  pageNum?: number
  pageSize?: number
}): Promise<InquiryListResponse> {
  const { inquiryStartAt, inquiryEndAt, answeredType = 'ALL', pageNum = 1, pageSize = 50 } = params
  const qs = new URLSearchParams({
    vendorId: VENDOR_ID,
    inquiryStartAt,
    inquiryEndAt,
    answeredType,
    pageNum: String(pageNum),
    pageSize: String(pageSize),
  }).toString()

  const res = await coupangRequest<{ data: InquiryListResponse }>(
    'GET',
    `/v2/providers/openapi/apis/api/v5/vendors/${VENDOR_ID}/onlineInquiries?${qs}`
  )
  return res.data
}

export async function replyToInquiry(inquiryId: number, content: string): Promise<void> {
  const wingId = process.env.COUPANG_WING_ID || VENDOR_ID
  await coupangRequest(
    'POST',
    `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/onlineInquiries/${inquiryId}/replies`,
    { content, vendorId: VENDOR_ID, replyBy: wingId }
  )
}

// ── Contact Center ──────────────────────────────────────────────────────────

export interface CallCenterReply {
  answerId: number
  parentAnswerId: number
  partnerTransferStatus: string | null
  partnerTransferCompleteReason: string
  answerType: string
  needAnswer: boolean
  receptionistName: string
  receptionist: string
  replyAt: string
  content: string
}

export interface CallCenterInquiry {
  inquiryId: number
  inquiryStatus: string
  csPartnerCounselingStatus: string
  vendorItemId: number[]
  itemName: string
  content: string
  answeredAt: string
  inquiryAt: string
  buyerPhone: string
  orderId: number
  orderDate: string
  receiptCategory: string
  replies: CallCenterReply[]
}

export interface CallCenterListResponse {
  content: CallCenterInquiry[]
  pagination: InquiryPagination
}

export async function fetchCallCenterInquiries(params: {
  inquiryStartAt: string
  inquiryEndAt: string
  partnerCounselingStatus?: 'NONE' | 'ANSWER' | 'NO_ANSWER' | 'TRANSFER'
  pageNum?: number
  pageSize?: number
}): Promise<CallCenterListResponse> {
  const { inquiryStartAt, inquiryEndAt, partnerCounselingStatus = 'NONE', pageNum = 1, pageSize = 30 } = params
  const qs = new URLSearchParams({
    vendorId: VENDOR_ID,
    inquiryStartAt,
    inquiryEndAt,
    partnerCounselingStatus,
    pageNum: String(pageNum),
    pageSize: String(pageSize),
  }).toString()

  const res = await coupangRequest<{ data: CallCenterListResponse }>(
    'GET',
    `/v2/providers/openapi/apis/api/v5/vendors/${VENDOR_ID}/callCenterInquiries?${qs}`
  )
  return res.data
}

export async function replyToCallCenterInquiry(
  inquiryId: number,
  content: string,
  parentAnswerId: number
): Promise<void> {
  const wingId = process.env.COUPANG_WING_ID || VENDOR_ID
  await coupangRequest(
    'POST',
    `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/callCenterInquiries/${inquiryId}/replies`,
    { vendorId: VENDOR_ID, inquiryId: String(inquiryId), content, replyBy: wingId, parentAnswerId }
  )
}
