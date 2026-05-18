import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const history = await prisma.researchHistory.findMany({
    orderBy: { searchedAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ history })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.researchHistory.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
