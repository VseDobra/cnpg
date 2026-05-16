import { NextResponse } from 'next/server'
import { checkAutoCategorizationAgreement } from '@/lib/coupang/categories'

export async function GET() {
  try {
    const agreed = await checkAutoCategorizationAgreement()
    return NextResponse.json({ agreed })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
