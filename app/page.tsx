'use client'
import { useEffect, useState } from 'react'
import KpiCard from '@/components/KpiCard'
import SalesChart from '@/components/SalesChart'
import OrdersTable from '@/components/OrdersTable'
import InventoryBar from '@/components/InventoryBar'
import ProductBreakdown from '@/components/ProductBreakdown'
import DowHeatmap from '@/components/DowHeatmap'

type DashData = {
  kpis: {
    revenue: number; prevRevenue: number
    orderCount: number; prevOrderCount: number; unitsSold: number; prevUnitsSold: number
    returnCount: number; prevReturnCount: number
    netProfit: number; hasCostData: boolean
    avgOrderValue: number; prevAvgOrderValue: number
    todayRevenue: number; yesterdayRevenue: number
    thisWeekRevenue: number; lastWeekRevenue: number
  }
  dailySales: { date: string; amount: number; profit: number; units: number }[]
  dowSales: { day: string; amount: number; orders: number }[]
  recentOrders: { id: string; product: string; amount: number; date: string; status: string; imageUrl?: string | null }[]
  productBreakdown: { name: string; imageUrl: string | null; revenue: number; orderCount: number; quantity: number; profit: number | null; margin: number | null }[]
  inventory: { productId: string; quantity: number; productName: string; imageUrl: string | null; salesLast30Days: number }[]
}

function pctChange(curr: number, prev: number) {
  if (prev === 0) return 0
  return Math.round(((curr - prev) / prev) * 100)
}

export default function Dashboard() {
  const [data, setData] = useState<DashData | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    fetch(`/api/dashboard?days=${days}`).then(r => r.json()).then(setData)
  }, [days])

  if (!data) return <div className="text-[#475569] text-sm">Загрузка...</div>

  const { kpis } = data

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-[17px] font-semibold text-[#f1f5f9] tracking-tight">Главный дашборд</h1>
        <div className="flex gap-1.5">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md border text-xs transition-colors ${
                days === d
                  ? 'bg-[#0c1628] text-[#22d3ee] border-[#22d3ee]'
                  : 'bg-[#0f172a] text-[#64748b] border-[#1e293b] hover:text-[#cbd5e1]'
              }`}
            >
              {d === 7 ? '7 дней' : d === 30 ? '30 дней' : '3 мес'}
            </button>
          ))}
        </div>
      </div>

      {/* Featured KPIs — 2 big cards */}
      <div className="grid grid-cols-2 gap-3 mb-2.5">
        <KpiCard
          featured
          label="Продажи"
          value={`₩${kpis.revenue.toLocaleString()}`}
          change={pctChange(kpis.revenue, kpis.prevRevenue)}
          changeLabel="vs прошлый период"
        />
        <KpiCard
          featured
          label="Заказы"
          value={String(kpis.orderCount)}
          change={pctChange(kpis.orderCount, kpis.prevOrderCount)}
          changeLabel="vs прошлый период"
        />
      </div>

      {/* Secondary KPIs — 3 smaller cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard
          label="Средний чек"
          value={`₩${kpis.avgOrderValue.toLocaleString()}`}
          change={pctChange(kpis.avgOrderValue, kpis.prevAvgOrderValue)}
          changeLabel="vs прошлый период"
        />
        <KpiCard
          label="Возвраты"
          value={String(kpis.returnCount)}
          change={pctChange(kpis.returnCount, kpis.prevReturnCount)}
          changeLabel="vs прошлый период"
        />
        <KpiCard
          label="Чистая прибыль"
          value={kpis.hasCostData ? `₩${kpis.netProfit.toLocaleString()}` : '—'}
          changeLabel={kpis.hasCostData ? undefined : 'Укажи себестоимость в товарах'}
        />
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Сегодня', curr: kpis.todayRevenue, prev: kpis.yesterdayRevenue },
          { label: 'Вчера', curr: kpis.yesterdayRevenue, prev: null },
          { label: 'Эта неделя', curr: kpis.thisWeekRevenue, prev: kpis.lastWeekRevenue },
          { label: 'Прошлая неделя', curr: kpis.lastWeekRevenue, prev: null },
        ].map(({ label, curr, prev }) => {
          const chg = prev !== null ? pctChange(curr, prev) : null
          const up = chg !== null && chg >= 0
          return (
            <div key={label} className="bg-[#0f172a] rounded-lg px-4 py-3 border border-[#1e293b] flex items-center justify-between">
              <span className="text-[11px] text-[#475569]">{label}</span>
              <div className="text-right">
                <span className="text-sm font-semibold text-[#cbd5e1]">₩{curr.toLocaleString()}</span>
                {chg !== null && (
                  <span className={`ml-2 text-[10px] ${up ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                    {up ? '↑' : '↓'}{Math.abs(chg)}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-5">
        <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
          <p className="text-[13px] font-medium text-[#94a3b8] mb-4">Продажи по дням (₩)</p>
          <SalesChart data={data.dailySales} showProfit={kpis.hasCostData} />
        </div>
        <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
          <p className="text-[13px] font-medium text-[#94a3b8] mb-4">По дням недели</p>
          <DowHeatmap data={data.dowSales} />
        </div>
      </div>

      {/* Product breakdown + inventory */}
      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-5">
        <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
          <p className="text-[13px] font-medium text-[#94a3b8] mb-5">Разбивка по товарам</p>
          <ProductBreakdown data={data.productBreakdown} />
        </div>
        <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
          <p className="text-[13px] font-medium text-[#94a3b8] mb-4">Склад</p>
          {data.inventory.length === 0
            ? <p className="text-[#475569] text-xs">Нет данных</p>
            : data.inventory.map(inv => (
              <InventoryBar key={inv.productId} productName={inv.productName} imageUrl={inv.imageUrl} quantity={inv.quantity} salesLast30Days={inv.salesLast30Days} />
            ))
          }
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-[#0f172a] rounded-xl p-5 border border-[#1e293b]">
        <p className="text-[13px] font-medium text-[#94a3b8] mb-3">Последние заказы</p>
        <OrdersTable orders={data.recentOrders} />
      </div>
    </div>
  )
}
