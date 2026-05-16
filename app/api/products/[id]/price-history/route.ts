import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const history = await prisma.priceHistory.findMany({
    where: { productId: id },
    orderBy: { recordedAt: 'desc' },
    take: 30,
  })
  return NextResponse.json(history)
}
