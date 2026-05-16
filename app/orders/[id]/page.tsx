'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface OrderItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  imageUrl: string | null
}

interface Order {
  id: string
  status: string
  orderedAt: string
  shipByDate: string | null
  totalPrice: number
  receiverName: string
  receiverAddress: string
  receiverPostCode?: string
  items: OrderItem[]
}

interface OrderCoupon {
  couponId: number
  vendorItemId: number
  promotionName: string
  discount: number
  maxDiscountPrice: number
  type: string
  status: string
}

const STATUS_LABELS: Record<string, string> = {
  INSTRUCT: 'В доставке',
  DELIVERED: 'Доставлен',
  CANCEL: 'Отменён',
  RETURN: 'Возврат',
  ACCEPT: 'Принят',
  DEPARTURE: 'Отправлен',
  WAIT_DELIVERY: 'Ожидает доставки',
}

const STATUS_COLORS: Record<string, string> = {
  INSTRUCT: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  DELIVERED: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  CANCEL: 'text-red-400 bg-red-400/10 border-red-400/20',
  RETURN: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  ACCEPT: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  DEPARTURE: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  WAIT_DELIVERY: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
}

function fmt(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coupons, setCoupons] = useState<OrderCoupon[]>([])

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then(r => { if (!r.ok) throw new Error('Не найдено'); return r.json() })
      .then(data => { setOrder(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
    fetch(`/api/orders/${id}/coupons`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCoupons(d) })
      .catch(() => {})
  }, [id])

  if (loading) return <div className="flex items-center justify-center h-48 text-[#6b7280] text-sm">Загрузка...</div>
  if (!order) return <div className="flex items-center justify-center h-48 text-red-400 text-sm">{error ?? 'Ошибка'}</div>

  const statusLabel = STATUS_LABELS[order.status] ?? order.status
  const statusColor = STATUS_COLORS[order.status] ?? 'text-[#9ca3af] bg-[#9ca3af]/10 border-[#9ca3af]/20'

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/orders')} className="text-[#6b7280] hover:text-white text-sm transition-colors">← Назад</button>
          <span className="text-[#2d3148]">/</span>
          <div>
            <p className="text-xs text-[#6b7280] mb-0.5">Заказ</p>
            <h1 className="text-base font-semibold font-mono">{order.id}</h1>
          </div>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full border ${statusColor}`}>{statusLabel}</span>
      </div>

      <div className="space-y-4">
        {/* Meta */}
        <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148] grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Дата заказа</p>
            <p className="text-sm text-white">{fmt(order.orderedAt)}</p>
          </div>
          {order.shipByDate && (
            <div>
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Отгрузить до</p>
              <p className="text-sm text-white">{fmt(order.shipByDate)}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Сумма заказа</p>
            <p className="text-lg font-bold text-white">₩{order.totalPrice.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Товаров</p>
            <p className="text-sm text-white">{order.items.reduce((s, i) => s + i.quantity, 0)} шт.</p>
          </div>
        </div>

        {/* Receiver */}
        {(order.receiverName || order.receiverAddress) && (
          <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-3">Получатель</p>
            {order.receiverName && <p className="text-sm text-white font-medium mb-1">{order.receiverName}</p>}
            {order.receiverAddress && <p className="text-sm text-[#9ca3af]">{order.receiverAddress}</p>}
          </div>
        )}

        {/* Coupons */}
        {coupons.length > 0 && (() => {
          const unique = Array.from(new Map(coupons.map(c => [c.couponId, c])).values())
          return (
            <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-3">Применённые купоны</p>
              <div className="space-y-2">
                {unique.map(c => (
                  <div key={c.couponId} className="flex items-center justify-between py-1.5 border-b border-[#1e2233] last:border-0">
                    <div>
                      <p className="text-sm text-white">{c.promotionName || `Купон #${c.couponId}`}</p>
                      <p className="text-xs text-[#4b5563]">ID: {c.couponId}</p>
                    </div>
                    <span className="text-sm font-medium text-green-400">
                      -{c.type === 'RATE' ? `${c.discount}%` : `₩${c.discount.toLocaleString()}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Items */}
        <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
          <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-4">Состав заказа</p>
          <div className="space-y-3">
            {order.items.map(item => (
              <div key={item.id} className="flex items-start justify-between gap-4 pb-3 border-b border-[#1e2233] last:border-0 last:pb-0">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-[#12141f] border border-[#2d3148] flex-shrink-0 overflow-hidden">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      : <div className="w-full h-full flex items-center justify-center text-[#4b5563] text-xs">?</div>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white leading-snug mb-1">{item.productName}</p>
                    <p className="text-xs text-[#4b5563]">ID: {item.productId}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm text-white">₩{item.unitPrice.toLocaleString()} × {item.quantity}</p>
                  <p className="text-xs text-[#6b7280] mt-0.5">= ₩{(item.unitPrice * item.quantity).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-4 pt-4 border-t border-[#2d3148] flex justify-between items-center">
            <p className="text-sm text-[#6b7280]">Итого</p>
            <p className="text-lg font-bold text-white">₩{order.totalPrice.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
