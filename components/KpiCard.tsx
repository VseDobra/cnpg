interface Props {
  label: string
  value: string
  change?: number
  changeLabel?: string
  featured?: boolean
}

export default function KpiCard({ label, value, change, changeLabel, featured = false }: Props) {
  const up = change !== undefined && change >= 0

  if (featured) {
    return (
      <div className="relative overflow-hidden rounded-xl p-5 border border-[#1e3a5f]"
        style={{ background: 'linear-gradient(135deg, #0c1628, #0f172a)' }}>
        <div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, #0ea5e9, #22d3ee)' }} />
        <p className="text-[11px] uppercase tracking-[0.8px] text-[#475569] mb-2">{label}</p>
        <p className="text-[28px] font-bold text-[#f1f5f9] tracking-tight leading-none mb-1.5">{value}</p>
        {change !== undefined && (
          <p className={`text-[12px] ${up ? 'text-[#22d3ee]' : 'text-[#f87171]'}`}>
            {up ? '↑' : '↓'} {Math.abs(change)}% {changeLabel}
          </p>
        )}
        {change === undefined && changeLabel && (
          <p className="text-[11px] text-[#334155]">{changeLabel}</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-[#0f172a] rounded-xl p-4 border border-[#1e293b]">
      <p className="text-[10px] uppercase tracking-[0.6px] text-[#475569] mb-1.5">{label}</p>
      <p className="text-[18px] font-semibold text-[#e2e8f0] mb-1">{value}</p>
      {change !== undefined && (
        <p className={`text-[11px] ${up ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
          {up ? '↑' : '↓'} {Math.abs(change)}% {changeLabel}
        </p>
      )}
      {change === undefined && changeLabel && (
        <p className="text-[11px] text-[#475569]">{changeLabel}</p>
      )}
    </div>
  )
}
