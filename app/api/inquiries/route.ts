import { NextRequest, NextResponse } from 'next/server'
import { fetchInquiries } from '@/lib/coupang/inquiries'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const inquiryStartAt = searchParams.get('inquiryStartAt')
    const inquiryEndAt = searchParams.get('inquiryEndAt')
    const answeredType = (searchParams.get('answeredType') ?? 'ALL') as 'ALL' | 'ANSWERED' | 'NOANSWER'
    const pageNum = Number(searchParams.get('pageNum') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '50')

    if (!inquiryStartAt || !inquiryEndAt) {
      return NextResponse.json({ error: 'inquiryStartAt и inquiryEndAt обязательны' }, { status: 400 })
    }

    const data = await fetchInquiries({ inquiryStartAt, inquiryEndAt, answeredType, pageNum, pageSize })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
