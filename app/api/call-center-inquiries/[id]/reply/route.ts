import { NextRequest, NextResponse } from 'next/server'
import { replyToCallCenterInquiry } from '@/lib/coupang/inquiries'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { content, parentAnswerId } = await req.json()
    if (!content?.trim()) {
      return NextResponse.json({ error: 'Текст ответа не может быть пустым' }, { status: 400 })
    }
    if (!parentAnswerId) {
      return NextResponse.json({ error: 'parentAnswerId обязателен' }, { status: 400 })
    }
    await replyToCallCenterInquiry(Number(id), content.trim(), Number(parentAnswerId))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
