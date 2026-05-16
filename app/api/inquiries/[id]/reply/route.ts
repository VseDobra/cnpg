import { NextRequest, NextResponse } from 'next/server'
import { replyToInquiry } from '@/lib/coupang/inquiries'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { content } = await req.json()
    if (!content?.trim()) {
      return NextResponse.json({ error: 'Текст ответа не может быть пустым' }, { status: 400 })
    }
    await replyToInquiry(Number(id), content.trim())
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
