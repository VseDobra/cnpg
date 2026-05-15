interface Props {
  productName: string
  quantity: number
  imageUrl?: string | null
  salesLast30Days?: number
  maxQuantity?: number
}

export default function InventoryBar({ productName, quantity, imageUrl, salesLast30Days, maxQuantity = 100 }: Props) {
  const dailySales = salesLast30Days != null && salesLast30Days > 0 ? salesLast30Days / 30 : null
  const daysLeft = dailySales != null ? Math.round(quantity / dailySales) : null

  const isCritical = daysLeft != null ? daysLeft < 7 : quantity <= 5
  const isLow = daysLeft != null ? daysLeft < 14 : quantity <= 10
  const color = isCritical ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-emerald-400'
  const textColor = isCritical ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-[#64748b]'
  const pct = Math.min((quantity / maxQuantity) * 100, 100)

  return (
    <div className="flex items-center gap-4 mb-5">
      <div className="w-14 h-14 rounded-xl bg-[#0f172a] border border-[#1e293b] flex-shrink-0 overflow-hidden">
        {imageUrl
          ? <img src={imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <div className="w-full h-full flex items-center justify-center text-[#1e293b] text-sm">—</div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="truncate max-w-[220px] text-sm font-medium">{productName}</span>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {daysLeft != null && (
              <span className={`text-[11px] ${textColor}`}>
                ~{daysLeft} дн.{isCritical ? ' 🔴' : isLow ? ' ⚠️' : ''}
              </span>
            )}
            <span className={`text-sm font-semibold ${textColor}`}>
              {quantity} шт.{daysLeft == null && (isCritical || isLow) ? (isCritical ? ' 🔴' : ' ⚠️') : ''}
            </span>
          </div>
        </div>
        <div className="h-2.5 bg-[#1e293b] rounded-full overflow-hidden mb-1">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        {salesLast30Days != null && (
          <div className="text-[10px] text-[#334155]">
            {salesLast30Days} шт. за 30 дней
            {dailySales != null && dailySales > 0 && ` · ${dailySales.toFixed(1)}/день`}
          </div>
        )}
      </div>
    </div>
  )
}
