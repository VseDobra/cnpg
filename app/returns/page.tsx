'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { exportCsv } from '@/lib/exportCsv'

interface Return {
  id: string
  orderId: string
  reason: string
  status: string
  requestedAt: string
}

interface Analytics {
  total: number
  topReasons: { reason: string; count: number }[]
  monthlyTrend: { month: string; count: number }[]
  byProduct: { name: string; returns: number; revenue: number }[]
}

const STATUS: Record<string, string> = {
  UC: 'Не обработан',
  RELEASE_STOP_UNCHECKED: 'Остановка отгрузки',
  RETURNS_UNCHECKED: 'Заявка на возврат',
  VENDOR_WAREHOUSE_CONFIRM: 'Товар получен',
  REQUEST_COUPANG_CHECK: 'На проверке',
  RETURNS_COMPLETED: 'Завершён',
}

const STATUS_COLORS: Record<string, string> = {
  UC: 'text-yellow-400 bg-yellow-400/10',
  RELEASE_STOP_UNCHECKED: 'text-yellow-400 bg-yellow-400/10',
  RETURNS_UNCHECKED: 'text-blue-400 bg-blue-400/10',
  VENDOR_WAREHOUSE_CONFIRM: 'text-purple-400 bg-purple-400/10',
  REQUEST_COUPANG_CHECK: 'text-orange-400 bg-orange-400/10',
  RETURNS_COMPLETED: 'text-emerald-400 bg-emerald-400/10',
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<Return[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/returns?analytics=1').then(r => r.json()).then(d => {
      setReturns(d.returns ?? [])
      setAnalytics(d.analytics ?? null)
    })
  }, [])

  const maxReasonCount = analytics ? Math.max(...analytics.topReasons.map(r => r.count), 1) : 1
  const maxMonthCount = analytics ? Math.max(...analytics.monthlyTrend.map(m => m.count), 1) : 1

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold">Возвраты</h1>
        <button
          onClick={() => exportCsv('returns.csv', returns.map(r => ({ ID: r.id, Заказ: r.orderId, Причина: r.reason, Статус: STATUS[r.status] ?? r.status, Дата: r.requestedAt?.split('T')[0] })))}
          className="text-xs text-[#6b7280] hover:text-white border border-[#2d3148] hover:border-[#6366f1] px-3 py-1.5 rounded-lg transition-colors"
        >
          ↓ CSV
        </button>
      </div>

      {analytics && analytics.total > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          {/* Всего */}
          <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
            <p className="text-[11px] text-[#6b7280] mb-2">Всего возвратов</p>
            <p className="text-[22px] font-bold text-white">{analytics.total}</p>
          </div>

          {/* Топ причины */}
          <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
            <p className="text-[11px] text-[#6b7280] mb-3">Топ причины</p>
            <div className="space-y-2">
              {analytics.topReasons.slice(0, 4).map(r => (
                <div key={r.reason}>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-[#9ca3af] truncate max-w-[160px]">{r.reason}</span>
                    <span className="text-[#6b7280] ml-2">{r.count}</span>
                  </div>
                  <div className="h-1 bg-[#2d3148] rounded-full overflow-hidden">
                    <div className="h-full bg-red-500/60 rounded-full" style={{ width: `${(r.count / maxReasonCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Тренд по месяцам */}
          <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
            <p className="text-[11px] text-[#6b7280] mb-3">Динамика (6 мес.)</p>
            <div className="flex items-end gap-1.5 h-16">
              {analytics.monthlyTrend.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-[#6366f1]/50 rounded-t"
                    style={{ height: `${Math.max(4, (m.count / maxMonthCount) * 48)}px` }}
                  />
                  <span className="text-[9px] text-[#4b5563]">{m.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {analytics && analytics.byProduct.length > 0 && (
        <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148] mb-5">
          <p className="text-[13px] font-semibold mb-4">Возвраты по товарам</p>
          <div className="space-y-2">
            {analytics.byProduct.map(p => (
              <div key={p.name} className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-[#9ca3af] truncate text-xs">{p.name}</span>
                <span className="text-red-400 font-medium text-xs">{p.returns} возв.</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['ID', 'Заказ', 'Причина', 'Статус', 'Дата'].map(h => (
                <th key={h} className="text-[10px] text-[#6b7280] uppercase tracking-wide px-4 py-3 text-left border-b border-[#2d3148]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {returns.map(r => (
              <tr
                key={r.id}
                onClick={() => router.push(`/returns/${r.id}`)}
                className="border-b border-[#1e2233] last:border-0 hover:bg-[#1e2233] cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 text-xs font-mono text-[#9ca3af]">#{r.id.slice(-7)}</td>
                <td className="px-4 py-3 text-xs font-mono text-[#9ca3af]">#{r.orderId.slice(-7)}</td>
                <td className="px-4 py-3 text-xs text-[#9ca3af] max-w-[200px] truncate">{r.reason || '—'}</td>
                <td className="px-4 py-3 text-xs">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] ${STATUS_COLORS[r.status] ?? 'text-[#6b7280] bg-[#6b7280]/10'}`}>
                    {STATUS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[#4b5563]">{r.requestedAt?.split('T')[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {returns.length === 0 && <p className="text-[#6b7280] text-sm text-center py-8">Возвратов нет</p>}
      </div>
    </div>
  )
}
