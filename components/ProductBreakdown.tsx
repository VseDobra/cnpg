'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface ProductStat {
  name: string
  imageUrl: string | null
  revenue: number
  orderCount: number
  quantity: number
  profit?: number | null
  margin?: number | null
}

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e']

function shortName(name: string, max = 28) {
  return name.length > max ? name.slice(0, max) + '…' : name
}

export default function ProductBreakdown({ data }: { data: ProductStat[] }) {
  if (!data.length) return <p className="text-[#475569] text-xs">Нет данных за период</p>

  const totalRevenue = data.reduce((s, p) => s + p.revenue, 0)

  const pieData = data.map((p, i) => ({
    name: shortName(p.name, 20),
    value: p.revenue,
    color: COLORS[i % COLORS.length],
  }))

  return (
    <div className="flex gap-6">
      <div className="w-48 flex-shrink-0 flex flex-col items-center justify-center">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={72} strokeWidth={0}>
              {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
              formatter={(v) => [`₩${Number(v ?? 0).toLocaleString()}`, ''] as [string, string]}
            />
          </PieChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-[#475569] mt-1 text-center">Доля продаж</p>
      </div>

      <div className="flex-1 space-y-3">
        {data.map((p, i) => {
          const pct = totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 100) : 0
          const color = COLORS[i % COLORS.length]
          const hasProfit = p.profit != null
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-[#0f172a] border border-[#1e293b] flex-shrink-0 overflow-hidden">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  : <div className="w-full h-full flex items-center justify-center text-[#1e293b] text-xs">—</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-medium truncate max-w-[200px]">{shortName(p.name)}</span>
                  <div className="flex items-baseline gap-2 ml-2 flex-shrink-0">
                    {hasProfit && (
                      <span className={`text-[11px] font-medium ${p.profit! >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                        ₩{p.profit!.toLocaleString()} ({p.margin}%)
                      </span>
                    )}
                    <span className="text-sm font-semibold" style={{ color }}>₩{p.revenue.toLocaleString()}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-[#1e293b] rounded-full overflow-hidden mb-1">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <div className="flex gap-3 text-[10px] text-[#475569]">
                  <span>{p.quantity} шт.</span>
                  <span>{p.orderCount} заказов</span>
                  <span>{pct}% продаж</span>
                  <span>₩{p.quantity > 0 ? Math.round(p.revenue / p.quantity).toLocaleString() : 0}/шт.</span>
                  {!hasProfit && <span className="text-[#334155]">себестоимость не указана</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
