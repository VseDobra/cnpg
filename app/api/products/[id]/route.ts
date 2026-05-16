import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fetchProductForEdit, updateProduct, deleteProduct } from '@/lib/coupang/products'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await fetchProductForEdit(id)
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const updates = await req.json()

  await updateProduct(id, updates)

  const dbUpdate: Record<string, unknown> = {}
  if (updates.name !== undefined) dbUpdate.name = updates.name
  if (updates.price !== undefined) dbUpdate.salePrice = updates.price
  if (updates.images !== undefined) {
    const firstImg = updates.images[0]
    dbUpdate.imageUrl = firstImg?.url || null
  }
  if (Object.keys(dbUpdate).length > 0) {
    await prisma.product.update({ where: { id }, data: dbUpdate })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteProduct(id)
    await prisma.product.delete({ where: { id } }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
