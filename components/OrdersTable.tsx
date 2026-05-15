'use client'
import { useRouter } from 'next/navigation'

const STATUS_STYLES: Record<string, string> = {
  DELIVERED: 'bg-[#064e3b] text-emerald-400',
  INSTRUCT: 'bg-[#1e3a5f] text-blue-400',
  WAITING_DELIVER: 'bg-[#1e3a5f] text-blue-400',
  WAIT_DELIVERY: 'bg-[#1e3a5f] text-blue-400',
  CANCEL: 'bg-[#3d1515] text-red-400',
  RETURN: 'bg-[#3d2200] text-orange-400',
  ACCEPT: 'bg-[#3d2c00] text-amber-400',
  DEPARTURE: 'bg-[#0a3040] text-cyan-400',
}

const STATUS_LABELS: Record<string, string> = {
  DELIVERED: 'Доставлен',
  INSTRUCT: 'В доставке',
  WAITING_DELIVER: 'Ожидает',
  WAIT_DELIVERY: 'Ожидает',
  CANCEL: 'Отменён',
  RETURN: 'Возврат',
  ACCEPT: 'Принят',
  DEPARTURE: 'Отправлен',
}

interface Order {
  id: string
  product: string
  amount: number
  date: string
  status: string
  imageUrl?: string | null
  couponDiscount?: number
}

export default function OrdersTable({ orders }: { orders: Order[] }) {
  const router = useRouter()

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {['ID', 'Товар', 'Сумма', 'Дата', 'Статус', ''].map(h => (
            <th key={h} className="text-[10px] text-[#6b7280] uppercase tracking-wide px-3 py-2 text-left border-b border-[#1e293b]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map(o => (
          <tr
            key={o.id}
            onClick={() => router.push(`/orders/${o.id}`)}
            className="border-b border-[#0f172a] last:border-0 hover:bg-[#0c1628] cursor-pointer transition-colors"
          >
            <td className="px-3 py-2.5 text-xs font-mono text-[#6b7280]">#{o.id.slice(-7)}</td>
            <td className="px-3 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-16 h-16 rounded-xl bg-[#0f172a] border border-[#1e293b] flex-shrink-0 overflow-hidden">
                  {o.imageUrl
                    ? <img src={o.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : <div className="w-full h-full flex items-center justify-center text-[#1e293b] text-xs">—</div>}
                </div>
                <span className="truncate max-w-[160px]">{o.product}</span>
              </div>
            </td>
            <td className="px-3 py-2.5 text-xs font-medium">
              ₩{o.amount.toLocaleString()}
              {o.couponDiscount && (
                <div className="text-[11px] text-red-400 font-normal">-₩{o.couponDiscount.toLocaleString()}</div>
              )}
            </td>
            <td className="px-3 py-2.5 text-xs text-[#6b7280]">{o.date}</td>
            <td className="px-3 py-2.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_STYLES[o.status] ?? 'bg-[#1e293b] text-gray-400'}`}>
                {STATUS_LABELS[o.status] ?? o.status}
              </span>
            </td>
            <td className="px-3 py-2.5 text-xs text-[#334155]">→</td>
          </tr>
        ))}
        {orders.length === 0 && (
          <tr>
            <td colSpan={6} className="px-3 py-4 text-xs text-[#6b7280] text-center">Нет данных</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
