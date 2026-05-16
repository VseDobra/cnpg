'use client'
import { useEffect, useState } from 'react'
import InventoryBar from '@/components/InventoryBar'
import { exportCsv } from '@/lib/exportCsv'

interface InventoryItem {
  productId: string
  productName: string
  imageUrl: string | null
  quantity: number
  salesLast30Days: number
}

function daysLeft(item: InventoryItem) {
  if (!item.salesLast30Days) return null
  return Math.round(item.quantity / (item.salesLast30Days / 30))
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])

  useEffect(() => {
    fetch('/api/inventory').then(r => r.json()).then(setItems)
  }, [])

  const critical = items.filter(i => {
    const d = daysLeft(i)
    return d != null ? d < 7 : i.quantity <= 5
  })
  const low = items.filter(i => {
    const d = daysLeft(i)
    return d != null ? (d >= 7 && d < 14) : (i.quantity > 5 && i.quantity <= 10)
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold">Склад</h1>
        <button
          onClick={() => exportCsv('inventory.csv', items.map(i => ({ Товар: i.productName, Остаток: i.quantity, 'Продаж за 30 дней': i.salesLast30Days })))}
          className="text-xs text-[#6b7280] hover:text-white border border-[#2d3148] hover:border-[#6366f1] px-3 py-1.5 rounded-lg transition-colors"
        >
          ↓ CSV
        </button>
      </div>

      {critical.length > 0 && (
        <div className="mb-3 p-4 bg-[#3d0000] border border-red-600 rounded-xl text-red-400 text-sm">
          🔴 Критически мало: {critical.map(i => {
            const d = daysLeft(i)
            return `${i.productName}${d != null ? ` (~${d} дн.)` : ` (${i.quantity} шт.)`}`
          }).join(', ')}
        </div>
      )}
      {low.length > 0 && (
        <div className="mb-4 p-4 bg-[#3d2c00] border border-amber-600 rounded-xl text-amber-400 text-sm">
          ⚠️ Мало остатков: {low.map(i => {
            const d = daysLeft(i)
            return `${i.productName}${d != null ? ` (~${d} дн.)` : ` (${i.quantity} шт.)`}`
          }).join(', ')}
        </div>
      )}

      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        {items.length === 0
          ? <p className="text-[#6b7280] text-sm text-center py-4">Нет данных.</p>
          : items
              .slice()
              .sort((a, b) => {
                const da = daysLeft(a) ?? (a.quantity <= 5 ? 3 : a.quantity <= 10 ? 10 : 999)
                const db = daysLeft(b) ?? (b.quantity <= 5 ? 3 : b.quantity <= 10 ? 10 : 999)
                return da - db
              })
              .map(inv => (
                <InventoryBar
                  key={inv.productId}
                  productName={inv.productName}
                  imageUrl={inv.imageUrl}
                  quantity={inv.quantity}
                  salesLast30Days={inv.salesLast30Days}
                />
              ))
        }
      </div>
    </div>
  )
}
