'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, List, Store, Image, Package,
  DollarSign, Undo2, Tag, MessageSquare, Search, TrendingUp, Settings2
} from 'lucide-react'

const NAV = [
  { href: '/', icon: LayoutGrid, label: 'Дашборд' },
  { href: '/orders', icon: List, label: 'Заказы' },
  { href: '/products', icon: Store, label: 'Товары' },
  { href: '/photos', icon: Image, label: 'Фото товаров' },
  { href: '/inventory', icon: Package, label: 'Склад' },
  { href: '/finance', icon: DollarSign, label: 'Финансы' },
  { href: '/returns', icon: Undo2, label: 'Возвраты' },
  { href: '/coupons', icon: Tag, label: 'Купоны' },
  { href: '/inquiries', icon: MessageSquare, label: 'Вопросы' },
  { href: '/research', icon: Search, label: 'Категории' },
  { href: '/trends', icon: TrendingUp, label: 'Тренды' },
  { href: '/settings', icon: Settings2, label: 'Настройки' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-[220px] bg-[#0f172a] border-r border-[#1e293b] flex flex-col">
      <div className="px-4 py-5 border-b border-[#1e293b]">
        <h2 className="text-[#f1f5f9] font-bold text-[15px] tracking-tight">Coupang</h2>
        <p className="text-[#475569] text-[11px] mt-0.5">Analytics Dashboard</p>
      </div>

      <nav className="flex-1 py-2">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-4 py-[9px] text-[12.5px] border-l-2 transition-colors ${
                active
                  ? 'text-[#22d3ee] bg-[#0c1628] border-[#22d3ee]'
                  : 'text-[#64748b] border-transparent hover:text-[#cbd5e1] hover:bg-[#0f172a]'
              }`}
            >
              <Icon size={15} strokeWidth={2} className="flex-shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mx-3 mb-4 p-2.5 bg-[#0c1628] rounded-lg border border-[#164e63] text-[11px] text-[#22d3ee] text-center">
        ↻ Синхронизация каждый час
      </div>
    </aside>
  )
}
