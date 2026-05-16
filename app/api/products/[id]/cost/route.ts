import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await prisma.product.findUnique({
    where: { id },
    select: { costPrice: true, couponDiscount: true, commission: true, adRate: true, taxRate: true, rgDelivery: true, naverCategoryId: true },
  })
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(product)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const numericData: Record<string, number> = {}
  if (typeof body.costPrice === 'number' && body.costPrice >= 0) numericData.costPrice = body.costPrice
  if (typeof body.couponDiscount === 'number' && body.couponDiscount >= 0) numericData.couponDiscount = body.couponDiscount
  if (typeof body.commission === 'number' && body.commission >= 0) numericData.commission = body.commission
  if (typeof body.adRate === 'number' && body.adRate >= 0) numericData.adRate = body.adRate
  if (typeof body.taxRate === 'number' && body.taxRate >= 0) numericData.taxRate = body.taxRate
  if (typeof body.rgDelivery === 'number' && body.rgDelivery >= 0) numericData.rgDelivery = body.rgDelivery

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...numericData,
      ...('naverCategoryId' in body ? { naverCategoryId: body.naverCategoryId || null } : {}),
    },
  })
  return NextResponse.json(product)
}
