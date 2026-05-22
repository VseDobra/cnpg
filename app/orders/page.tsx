'use client'
import { useEffect, useState } from 'react'
import OrdersTable from '@/components/OrdersTable'
import { exportCsv } from '@/lib/exportCsv'

const STATUSES = ['', 'INSTRUCT', 'DELIVERED', 'CANCEL', 'RETURN']
const STATUS_LABELS: Record<string, string> = {
  '': 'Все', INSTRUCT: 'Доставка', DELIVERED: 'Доставлен', CANCEL: 'Отменён', RETURN: 'Возврат',
}

interface OrderRow {
  id: string; product: string; amount: number; date: string; status: string; imageUrl?: string | null
  couponDiscount?: number
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch(`/api/orders${status ? `?status=${status}` : ''}`)
      .then(r => r.json())
      .then(async (data: { id: string; totalPrice: number; orderedAt: string; status: string; items: { productName: string; imageUrl?: string | null }[] }[]) => {
        const rows: OrderRow[] = data.map(o => ({
          id: o.id,
          product: o.items[0]?.productName ?? '—',
          amount: o.totalPrice,
          date: o.orderedAt.split('T')[0],
          status: o.status,
          imageUrl: o.items[0]?.imageUrl ?? null,
        }))
        setOrders(rows)

        // подгружаем купоны последовательно чтобы не получить rate limit
        const couponsResults: unknown[][] = []
        for (const o of rows) {
          const cs = await fetch(`/api/orders/${o.id}/coupons`).then(r => r.json()).catch(() => [])
          couponsResults.push(Array.isArray(cs) ? cs : [])
        }
        setOrders(rows.map((o, i) => {
          const cs = couponsResults[i] as { couponId: number; type: string; discount: number }[]
          const unique: { type: string; discount: number }[] = Array.from(
            new Map(cs.map((c) => [c.couponId, c])).values()
          )
          const discount = unique.reduce((sum, c) => {
            if (c.type === 'RATE') return sum
            return sum + c.discount
          }, 0)
          return { ...o, couponDiscount: discount > 0 ? discount : undefined }
        }))
      })
  }, [status])

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-[17px] font-semibold text-[#f1f5f9] tracking-tight">Заказы</h1>
        <button
          onClick={() => exportCsv('orders.csv', orders.map(o => ({ ID: o.id, Товар: o.product, Сумма: o.amount, Дата: o.date, Статус: o.status, Купон: o.couponDiscount ?? '' })))}
          className="text-xs text-[#64748b] hover:text-[#cbd5e1] border border-[#1e293b] hover:border-[#475569] px-3 py-1.5 rounded-lg transition-colors"
        >
          ↓ CSV
        </button>
      </div>
      <div className="flex gap-1.5 mb-4">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-md border text-xs transition-colors ${
              status === s
                ? 'bg-[#0c1628] text-[#22d3ee] border-[#22d3ee]'
                : 'bg-[#0f172a] text-[#64748b] border-[#1e293b] hover:text-[#cbd5e1]'
            }`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
        <OrdersTable orders={orders} />
      </div>
    </div>
  )
}
