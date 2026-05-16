'use client'
import { useEffect, useState } from 'react'
import KpiCard from '@/components/KpiCard'

function pctChange(curr: number, prev: number) {
  if (prev === 0) return 0
  return Math.round(((curr - prev) / prev) * 100)
}

export default function TelegramApp() {
  const [data, setData] = useState<{ kpis: { revenue: number; prevRevenue: number; orderCount: number; prevOrderCount: number; returnCount: number; netProfit: number }; recentOrders: { id: string; product: string; amount: number }[] } | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then(({ default: WebApp }) => {
        WebApp.ready()
        WebApp.expand()
      }).catch(() => {})
    }
    fetch('/api/dashboard?days=30').then(r => r.json()).then(setData)
  }, [])

  if (!data) return <div className="text-[#6b7280] text-sm">Загрузка...</div>

  const { kpis } = data

  return (
    <div>
      <h1 className="text-base font-bold mb-4">🛒 Coupang</h1>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <KpiCard label="Выручка" value={`₩${kpis.revenue.toLocaleString()}`} change={pctChange(kpis.revenue, kpis.prevRevenue)} changeLabel="" />
        <KpiCard label="Заказы" value={String(kpis.orderCount)} change={pctChange(kpis.orderCount, kpis.prevOrderCount)} changeLabel="" />
        <KpiCard label="Возвраты" value={String(kpis.returnCount)} />
        <KpiCard label="Прибыль" value={`₩${kpis.netProfit.toLocaleString()}`} />
      </div>
      <div className="bg-[#1a1d2e] rounded-xl p-4 border border-[#2d3148]">
        <p className="text-xs font-semibold mb-3">Последние заказы</p>
        {data.recentOrders.map(o => (
          <div key={o.id} className="flex justify-between py-2 border-b border-[#1e2233] last:border-0 text-xs">
            <span className="text-[#9ca3af]">{o.product}</span>
            <span>₩{o.amount.toLocaleString()}</span>
          </div>
        ))}
        {data.recentOrders.length === 0 && <p className="text-[#6b7280] text-xs text-center py-2">Нет заказов</p>}
      </div>
    </div>
  )
}
