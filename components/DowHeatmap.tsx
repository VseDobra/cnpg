'use client'

interface Props {
  data: { day: string; amount: number; orders: number }[]
}

export default function DowHeatmap({ data }: Props) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.amount), 1)

  return (
    <div className="flex gap-2 items-end">
      {data.map((d) => {
        const pct = d.amount / max
        const h = Math.max(8, Math.round(pct * 80))
        const isTop = pct === 1
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5 group relative">
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10">
              <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap">
                <div className="text-white font-semibold">₩{d.amount.toLocaleString()}</div>
                <div className="text-[#94a3b8]">{d.orders} заказов</div>
              </div>
            </div>
            <div
              className={`w-full rounded-t-md transition-all ${isTop ? 'bg-[#0ea5e9]' : 'bg-[#0ea5e9]/30'}`}
              style={{ height: `${h}px` }}
            />
            <span className="text-[10px] text-[#94a3b8]">{d.day}</span>
          </div>
        )
      })}
    </div>
  )
}
