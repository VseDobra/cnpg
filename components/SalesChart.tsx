'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props {
  data: { date: string; amount: number; profit: number }[]
  showProfit?: boolean
}

export default function SalesChart({ data, showProfit }: Props) {
  const formatted = data.map(d => ({ ...d, label: d.date.slice(5) }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={6} />
        <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={60} tickFormatter={v => `₩${(v/1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, fontSize: 13 }}
          labelStyle={{ color: '#e2e8f0', marginBottom: 4 }}
          formatter={(v: number, name: string) => [
            `₩${Number(v).toLocaleString()}`,
            name === 'amount' ? 'Продажи' : 'Прибыль',
          ]}
          cursor={{ fill: 'rgba(14,165,233,0.08)' }}
        />
        {showProfit && (
          <Legend
            formatter={(value) => value === 'amount' ? 'Продажи' : 'Прибыль'}
            wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: 8 }}
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
