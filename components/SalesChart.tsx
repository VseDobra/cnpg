'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props {
  data: { date: string; amount: number; profit: number; units: number }[]
  showProfit?: boolean
}

export default function SalesChart({ data, showProfit }: Props) {
  const formatted = data.map(d => ({ ...d, label: d.date.slice(5) }))

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: typeof formatted[number] }>; label?: string }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-[10px] text-[13px] px-3 py-2">
        <div className="text-[#e2e8f0] mb-1">{label}</div>
        <div className="text-[#0ea5e9]">Продажи: ₩{d.amount.toLocaleString()}</div>
        <div className="text-[#94a3b8]">Штук: {d.units}</div>
        {showProfit && <div className="text-[#22d3ee]">Прибыль: ₩{d.profit.toLocaleString()}</div>}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={6} />
        <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={60} tickFormatter={v => `₩${(v/1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(14,165,233,0.08)' }} />
        {showProfit && (
          <Legend
            formatter={(value) => value === 'amount' ? 'Продажи' : 'Прибыль'}
            wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }}
          />
        )}
        <Bar dataKey="amount" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        {showProfit && (
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#22d3ee' }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
