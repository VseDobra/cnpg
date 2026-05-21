import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const runs = await prisma.scraperRun.findMany({
    orderBy: { scrapedAt: 'desc' },
    select: {
      id: true,
      keyword: true,
      scrapedAt: true,
      verdictLevel: true,
      verdictText: true,
      reviewCount: true,
      productCount: true,
    },
    take: 200,
  })
  return NextResponse.json({ runs })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.scraperRun.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
