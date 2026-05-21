'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'

interface Props {
  data: { day: string; amount: number; orders: number }[]
}

export default function DowHeatmap({ data }: Props) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.amount), 1)

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof data[number] }> }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-[10px] text-[13px] px-3 py-2">
        <div className="text-[#e2e8f0] mb-1">{d.day}</div>
        <div className="text-[#0ea5e9]">Продажи: ₩{d.amount.toLocaleString()}</div>
        <div className="text-[#94a3b8]">{d.orders} заказов</div>
      </div>
    )
  }

  const formatK = (v: number) => v === 0 ? '' : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={4} />
        <YAxis hide domain={[0, max * 1.15]} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(14,165,233,0.08)' }} />
        <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.amount === max ? '#0ea5e9' : '#0ea5e9'} fillOpacity={d.amount === max ? 1 : 0.35} />
          ))}
          <LabelList
            dataKey="amount"
            position="top"
            formatter={formatK}
            style={{ fill: '#cbd5e1', fontSize: 11, fontWeight: 500 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
