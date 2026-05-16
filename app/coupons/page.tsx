'use client'
import { useEffect, useState } from 'react'

interface Contract { contractId: number; type: string; start: string; end: string }
interface Coupon {
  couponId: number; contractId: number; promotionName: string | null
  status: string; type: string; discount: number; maxDiscountPrice: number
  startAt: string; endAt: string
}
interface Product { id: string; name: string; items: { vendorItemId: string; itemName: string }[] }

const STATUS_LABELS: Record<string, string> = {
  STANDBY: 'Ожидание', APPLIED: 'Активен', PAUSED: 'Приостановлен', EXPIRED: 'Истёк', DETACHED: 'Отключён',
}
const STATUS_COLORS: Record<string, string> = {
  STANDBY: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  APPLIED: 'text-green-400 bg-green-400/10 border-green-400/20',
  PAUSED: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  EXPIRED: 'text-[#4b5563] bg-transparent border-[#2d3148]',
  DETACHED: 'text-[#4b5563] bg-transparent border-[#2d3148]',
}
const TYPE_LABELS: Record<string, string> = {
  RATE: '% скидка', PRICE: '₩ скидка', FIXED_WITH_QUANTITY: '₩ за штуку',
}

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 00:00:00`
const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 7)

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [statusFilter, setStatusFilter] = useState('APPLIED')
  const [loading, setLoading] = useState(true)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  // Add items state
  const [addItemsCouponId, setAddItemsCouponId] = useState<number | null>(null)
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [addingItems, setAddingItems] = useState(false)
  const [addItemsMsg, setAddItemsMsg] = useState<string | null>(null)

  // Expire confirm
  const [expireConfirm, setExpireConfirm] = useState<Coupon | null>(null)
  const [expiring, setExpiring] = useState(false)

  const [form, setForm] = useState({
    contractId: 0,
    name: '',
    type: 'RATE' as 'RATE' | 'PRICE' | 'FIXED_WITH_QUANTITY',
    discount: 10,
    maxDiscountPrice: 5000,
    startAt: fmtDate(tomorrow),
    endAt: fmtDate(nextWeek),
  })

  const loadCoupons = (status = statusFilter) => {
    setLoading(true)
    fetch(`/api/coupons?status=${status}`).then(r => r.json()).then(d => {
      setCoupons(Array.isArray(d) ? d : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    loadCoupons()
    fetch('/api/coupons/contracts').then(r => r.json()).then(d => {
      if (Array.isArray(d)) { setContracts(d); if (d.length > 0) setForm(f => ({ ...f, contractId: d[0].contractId })) }
    })
    fetch('/api/products').then(r => r.json()).then(async (ps: Array<{ id: string; name: string }>) => {
      const details = await Promise.all(ps.map(p =>
        fetch(`/api/products/${p.id}`).then(r => r.json()).then(d => ({ id: p.id, name: p.name, items: d.items ?? [] })).catch(() => ({ id: p.id, name: p.name, items: [] }))
      ))
      setProducts(details)
    })
  }, [])

  async function pollStatus(requestedId: string, onDone: (ok: boolean, msg: string) => void) {
    const maxAttempts = 10
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const res = await fetch(`/api/coupons/requests/${requestedId}`)
        const d = await res.json()
        if (d.status === 'DONE') { onDone(true, `Готово: ${d.succeeded} из ${d.total} успешно`); return }
        if (d.status === 'FAIL') {
          const reasons = d.failedVendorItems?.map((f: { reason: string }) => f.reason).join(', ')
          onDone(false, `Ошибка: ${reasons || 'неизвестная причина'}`); return
        }
      } catch { /* продолжаем polling */ }
    }
    onDone(false, 'Истекло время ожидания — проверьте статус вручную')
  }

  async function handleCreate() {
    if (!form.name) { setCreateError('Введите название акции'); return }
    if (!form.contractId) { setCreateError('Выберите контракт'); return }
    setCreating(true); setCreateError(null); setCreateSuccess(null)
    try {
      const res = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setCreateSuccess('Купон создаётся...')
      setShowCreate(false)
      pollStatus(data.requestedId, (ok, msg) => {
        setCreateSuccess(ok ? `✓ ${msg}` : null)
        if (!ok) setCreateError(msg)
        loadCoupons('STANDBY'); setStatusFilter('STANDBY')
      })
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setCreating(false)
    }
  }

  async function handleExpire() {
    if (!expireConfirm) return
    setExpiring(true)
    try {
      const res = await fetch(`/api/coupons/${expireConfirm.couponId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setExpireConfirm(null)
      loadCoupons()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setExpiring(false)
    }
  }

  async function handleAddItems() {
    if (!addItemsCouponId || selectedItems.length === 0) return
    setAddingItems(true); setAddItemsMsg(null)
    try {
      const res = await fetch(`/api/coupons/${addItemsCouponId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorItemIds: selectedItems.map(Number) })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAddItemsMsg('Товары добавляются...')
      setSelectedItems([])
      pollStatus(data.requestedId, (ok, msg) => {
        setAddItemsMsg(ok ? `✓ ${msg}` : `✗ ${msg}`)
      })
    } catch (e) {
      setAddItemsMsg(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setAddingItems(false)
    }
  }

  const allVendorItems = products.flatMap(p => p.items.map(i => ({ ...i, productName: p.name })))

  return (
    <div className="max-w-4xl mx-auto">

      {/* Expire confirm modal */}
      {expireConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-2xl p-6 w-80 shadow-2xl">
            <div className="text-2xl mb-3 text-center">🛑</div>
            <h3 className="text-sm font-semibold text-white text-center mb-2">Отключить купон?</h3>
            <p className="text-xs text-[#6b7280] text-center mb-5">«{expireConfirm.promotionName ?? `Купон #${expireConfirm.couponId}`}»</p>
            <div className="flex gap-3">
              <button onClick={() => setExpireConfirm(null)} className="flex-1 px-4 py-2 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] text-[#9ca3af] hover:text-white text-sm rounded-lg transition-colors">Отмена</button>
              <button onClick={handleExpire} disabled={expiring} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {expiring ? 'Отключение...' : 'Да, отключить'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Купоны</h1>
        <button onClick={() => { setShowCreate(true); setCreateError(null); setCreateSuccess(null) }}
          className="bg-[#6366f1] hover:bg-[#5457e0] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + Создать купон
        </button>
      </div>

      {createSuccess && <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-xl px-5 py-3 text-green-400 text-sm">{createSuccess}</div>}

      {/* Create form */}
      {showCreate && (
        <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-5 mb-5 space-y-4">
          <h2 className="text-sm font-medium text-[#9ca3af]">Новый купон</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#6b7280] mb-1.5">Название акции *</label>
              <input className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Напр.: Весенняя скидка 10%" />
            </div>
            <div>
              <label className="block text-xs text-[#6b7280] mb-1.5">Контракт *</label>
              <select className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.contractId} onChange={e => setForm(f => ({ ...f, contractId: Number(e.target.value) }))}>
                {contracts.length === 0 && <option value={0}>Загрузка...</option>}
                {contracts.map(c => <option key={c.contractId} value={c.contractId}>#{c.contractId} — {c.type} ({c.end.slice(0, 10)})</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#6b7280] mb-1.5">Тип скидки</label>
              <select className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'RATE' | 'PRICE' | 'FIXED_WITH_QUANTITY' }))}>
                <option value="RATE">% от цены</option>
                <option value="PRICE">Фиксированная сумма ₩</option>
                <option value="FIXED_WITH_QUANTITY">Фикс. за штуку ₩</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6b7280] mb-1.5">{form.type === 'RATE' ? 'Размер скидки, %' : 'Размер скидки, ₩'}</label>
              <input type="number" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.discount} onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs text-[#6b7280] mb-1.5">Макс. скидка, ₩</label>
              <input type="number" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.maxDiscountPrice} onChange={e => setForm(f => ({ ...f, maxDiscountPrice: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#6b7280] mb-1.5">Начало (yyyy-MM-dd HH:mm:ss)</label>
              <input className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.startAt} onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[#6b7280] mb-1.5">Конец (yyyy-MM-dd HH:mm:ss)</label>
              <input className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.endAt} onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))} />
            </div>
          </div>

          {createError && <p className="text-red-400 text-xs">{createError}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] text-[#9ca3af] hover:text-white text-sm rounded-lg transition-colors">Отмена</button>
            <button onClick={handleCreate} disabled={creating} className="px-5 py-2 bg-[#6366f1] hover:bg-[#5457e0] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {creating ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {['APPLIED', 'STANDBY', 'PAUSED', 'EXPIRED'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); loadCoupons(s) }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${statusFilter === s ? 'bg-[#6366f1] border-[#6366f1] text-white' : 'bg-[#12141f] border-[#2d3148] text-[#6b7280] hover:text-white'}`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Coupons list */}
      <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] overflow-hidden mb-5">
        {loading ? (
          <div className="text-center py-10 text-[#6b7280] text-sm">Загрузка...</div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-10 text-[#4b5563] text-sm">Купоны не найдены</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>{['Название', 'Скидка', 'Период', 'Статус', ''].map((h, i) => (
                <th key={i} className="text-[10px] text-[#6b7280] uppercase tracking-wide px-4 py-2.5 text-left border-b border-[#2d3148]">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.couponId} className="border-b border-[#1e2233] last:border-0 hover:bg-[#1e2233] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm text-white">{c.promotionName ?? `Купон #${c.couponId}`}</div>
                    <div className="text-[10px] text-[#4b5563]">ID: {c.couponId}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-white">
                    {c.type === 'RATE' ? `${c.discount}%` : `₩${c.discount.toLocaleString()}`}
                    <div className="text-[10px] text-[#4b5563]">макс. ₩{c.maxDiscountPrice.toLocaleString()}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#9ca3af]">
                    {c.startAt.slice(0, 10)}<br/><span className="text-[#4b5563]">→ {c.endAt.slice(0, 10)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[c.status] ?? ''}`}>{STATUS_LABELS[c.status] ?? c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setAddItemsCouponId(c.couponId); setSelectedItems([]); setAddItemsMsg(null) }}
                        className="text-xs px-2.5 py-1.5 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] text-[#6b7280] hover:text-white rounded-lg transition-colors">
                        + Товары
                      </button>
                      {c.status !== 'EXPIRED' && c.status !== 'DETACHED' && (
                        <button onClick={() => setExpireConfirm(c)}
                          className="text-xs px-2.5 py-1.5 bg-[#12141f] border border-[#2d3148] hover:border-red-500/50 text-[#6b7280] hover:text-red-400 rounded-lg transition-colors">
                          Отключить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add items panel */}
      {addItemsCouponId !== null && (
        <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#9ca3af]">Добавить товары к купону #{addItemsCouponId}</h2>
            <button onClick={() => setAddItemsCouponId(null)} className="text-[#4b5563] hover:text-white text-lg leading-none">×</button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {allVendorItems.map(item => (
              <label key={item.vendorItemId} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-[#12141f] rounded-lg">
                <input type="checkbox" className="accent-[#6366f1]"
                  checked={selectedItems.includes(item.vendorItemId)}
                  onChange={e => setSelectedItems(prev => e.target.checked ? [...prev, item.vendorItemId] : prev.filter(x => x !== item.vendorItemId))} />
                <span className="text-xs text-white">{item.productName}</span>
                <span className="text-[10px] text-[#4b5563]">{item.itemName} — {item.vendorItemId}</span>
              </label>
            ))}
          </div>
          {addItemsMsg && <p className={`text-xs ${addItemsMsg.includes('requestedId') ? 'text-green-400' : 'text-red-400'}`}>{addItemsMsg}</p>}
          <div className="flex gap-3">
            <button onClick={() => setAddItemsCouponId(null)} className="px-4 py-2 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] text-[#9ca3af] hover:text-white text-sm rounded-lg transition-colors">Отмена</button>
            <button onClick={handleAddItems} disabled={addingItems || selectedItems.length === 0}
              className="px-5 py-2 bg-[#6366f1] hover:bg-[#5457e0] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {addingItems ? 'Добавление...' : `Добавить ${selectedItems.length > 0 ? `(${selectedItems.length})` : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
