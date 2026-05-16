import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fetchProductRaw } from '@/lib/coupang/products'

export async function GET() {
  const vendorId = process.env.COUPANG_VENDOR_ID ?? ''
  let vendorUserId = ''

  try {
    const product = await prisma.product.findFirst()
    if (product) {
      const raw = await fetchProductRaw(product.id)
      vendorUserId = (raw.vendorUserId as string) ?? ''
    }
  } catch {
    // return empty vendorUserId, user can fill manually
  }

  return NextResponse.json({ vendorId, vendorUserId })
}
