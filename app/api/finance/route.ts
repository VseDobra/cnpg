import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const settlements = await prisma.settlement.findMany({ orderBy: { settledAt: 'desc' } })
  const total = settlements.reduce(
    (s, st) => ({ amount: s.amount + st.amount, commission: s.commission + st.commission, net: s.net + st.netAmount }),
    { amount: 0, commission: 0, net: 0 }
  )
  return NextResponse.json({ settlements, total })
}
