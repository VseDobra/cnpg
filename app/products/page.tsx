'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  salePrice: number
  status: string
  imageUrl: string | null
}

interface CostData {
  costPrice: number
  couponDiscount: number
  commission: number
  adRate: number
  taxRate: number
  rgDelivery: number
}

interface InflowStatus {
  registeredCount: number
  permittedCount: number | null
  restricted: boolean
}

interface HistoryEntry {
  status: string
  statusRu: string
  comment: string
  createdBy: string
  createdByRu: string
  createdAt: string
}

const chr = (...codes: number[]) => codes.map(c => String.fromCodePoint(c)).join('')
const K_SEUNGIN   = chr(0xC2B9, 0xC778)
const K_WANLYO    = chr(0xC644, 0xB8CC)
const K_DAEGIJUNG = chr(0xB300, 0xAE30, 0xC911)
const K_YOCHEONG  = chr(0xC694, 0xCCAD)
const K_GEOBU     = chr(0xAC70, 0xBD80)
const K_BUPUN     = chr(0xBD80, 0xBD84)
const K_IMSI      = chr(0xC784, 0xC2DC, 0xC800, 0xC7A5)
const K_SAGJE     = chr(0xC0AD, 0xC81C)
const K_GEOMSUJUNG = chr(0xAC80, 0xC218, 0xC911)

const STATUS_EN: Record<string, string> = {
  SAVED: 'Черновик', APPROVING: 'Ожидает одобрения', IN_REVIEW: 'На проверке',
  APPROVED: 'Одобрен', PARTIAL_APPROVED: 'Частично одобрен', DENIED: 'Отклонён', DELETED: 'Удалён',
}

function translateStatus(s: string): string {
  if (!s) return s
  const en = STATUS_EN[s]
  if (en) return en
  if (s.includes(K_IMSI)) return 'Черновик'
  if (s.includes(K_SEUNGIN + K_WANLYO)) return 'Одобрен'
  if (s.includes(K_SEUNGIN + K_DAEGIJUNG)) return 'Ожидает одобрения'
  if (s.includes(K_SEUNGIN + K_YOCHEONG)) return 'Запрос одобрения'
  if (s.includes(K_SEUNGIN + K_GEOBU)) return 'Отклонён'
  if (s.includes(K_BUPUN + K_SEUNGIN)) return 'Частично одобрен'
  if (s.includes(K_SAGJE)) return 'Удалён'
  if (s.includes(K_GEOMSUJUNG)) return 'На проверке'
  return s
}

const STATUS_COLORS: Record<string, string> = {
  'Одобрен': 'text-green-400 border-green-500/30 bg-green-500/10',
  'Черновик': 'text-[#6b7280] border-[#2d3148] bg-[#12141f]',
  'Ожидает одобрения': 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  'Запрос одобрения': 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  'На проверке': 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  'Частично одобрен': 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  'Отклонён': 'text-red-400 border-red-500/30 bg-red-500/10',
  'Удалён': 'text-red-400 border-red-500/30 bg-red-500/10',
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [inflow, setInflow] = useState<InflowStatus | null>(null)
  const [historyProductId, setHistoryProductId] = useState<string | null>(null)
  const [historyData, setHistoryData] = useState<HistoryEntry[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [skuSearch, setSkuSearch] = useState('')
  const [skuResult, setSkuResult] = useState<{ sellerProductId: number; sellerProductName: string; statusName: string; brand: string | null; createdAt: string } | null | 'not_found' | 'loading'>('not_found')
  const [costModal, setCostModal] = useState<{ product: Product; data: CostData } | null>(null)
  const [costSaving, setCostSaving] = useState(false)
  const [costMsg, setCostMsg] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(setProducts)
    fetch('/api/products/inflow-status').then(r => r.json()).then(data => {
      if (!data.error) setInflow(data)
    })
  }, [])

  async function searchBySku() {
    const sku = skuSearch.trim()
    if (!sku) return
    setSkuResult('loading')
    try {
      const res = await fetch(`/api/products/by-sku/${encodeURIComponent(sku)}`)
      const data = await res.json()
      if (data.error) { setSkuResult('not_found'); return }
      const list = Array.isArray(data) ? data : []
      setSkuResult(list.length > 0 ? list[0] : 'not_found')
    } catch {
      setSkuResult('not_found')
    }
  }

  async function openCostModal(product: Product) {
    const defaults: CostData = { costPrice: 0, couponDiscount: 0, commission: 10.8, adRate: 5, taxRate: 10, rgDelivery: 0 }
    setCostModal({ product, data: defaults })
    setCostMsg(null)
    const d = await fetch(`/api/products/${product.id}/cost`).then(r => r.ok ? r.json() : null)
    if (d) setCostModal({ product, data: { costPrice: d.costPrice ?? 0, couponDiscount: d.couponDiscount ?? 0, commission: d.commission ?? 10.8, adRate: d.adRate ?? 5, taxRate: d.taxRate ?? 10, rgDelivery: d.rgDelivery ?? 0 } })
  }

  async function saveCost() {
    if (!costModal) return
    setCostSaving(true); setCostMsg(null)
    try {
      await fetch(`/api/products/${costModal.product.id}/cost`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(costModal.data) })
      setCostMsg('✓ Сохранено')
      setTimeout(() => setCostMsg(null), 3000)
    } catch { setCostMsg('Ошибка') } finally { setCostSaving(false) }
  }

  function setCostField(field: keyof CostData, value: number) {
    setCostModal(m => m ? { ...m, data: { ...m.data, [field]: value } } : m)
  }

  async function openHistory(productId: string) {
    setHistoryProductId(productId)
    setHistoryData(null)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/products/${productId}/history`)
      const data = await res.json()
      setHistoryData(Array.isArray(data) ? data : [])
    } catch {
      setHistoryData([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const historyProduct = products.find(p => p.id === historyProductId)

  return (
    <div>
      {costModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setCostModal(null)}>
          <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-2xl p-6 w-[520px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Себестоимость</h3>
                <p className="text-xs text-[#6b7280] mt-0.5 truncate max-w-[380px]">{costModal.product.name}</p>
              </div>
              <button onClick={() => setCostModal(null)} className="text-[#4b5563] hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1.5">Себестоимость (₩)</label>
                  <input type="number" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none" value={costModal.data.costPrice || ''} onChange={e => setCostField('costPrice', parseInt(e.target.value) || 0)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1.5">Скидка купона (₩)</label>
                  <input type="number" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none" value={costModal.data.couponDiscount || ''} onChange={e => setCostField('couponDiscount', parseInt(e.target.value) || 0)} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1.5">Комиссия (%)</label>
                  <input type="number" step="0.1" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none" value={costModal.data.commission} onChange={e => setCostField('commission', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1.5">Реклама (%)</label>
                  <input type="number" step="0.1" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none" value={costModal.data.adRate} onChange={e => setCostField('adRate', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1.5">Налог ИП (%)</label>
                  <input type="number" step="0.1" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none" value={costModal.data.taxRate} onChange={e => setCostField('taxRate', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1.5">Доставка RG (₩)</label>
                  <input type="number" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none" value={costModal.data.rgDelivery || ''} onChange={e => setCostField('rgDelivery', parseInt(e.target.value) || 0)} placeholder="0" />
                </div>
              </div>
              {costModal.data.costPrice > 0 && (() => {
                const { costPrice, couponDiscount, commission, adRate, taxRate, rgDelivery } = costModal.data
                const net = costModal.product.salePrice - couponDiscount
                const profit = net - Math.round(net * commission / 100) - Math.round(net * adRate / 100) - Math.round(net * taxRate / 100) - rgDelivery - costPrice
                const margin = net > 0 ? Math.round((profit / net) * 100) : 0
                return (
                  <div className="flex items-center gap-3 bg-[#12141f] rounded-lg p-3 border border-[#2d3148]">
                    <div className="flex-1">
                      <p className="text-[10px] text-[#4b5563]">Прибыль/шт.</p>
                      <p className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>₩{profit.toLocaleString()}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-[#4b5563]">Маржа</p>
                      <p className={`text-sm font-bold ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{margin}%</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-[#4b5563]">Цена продажи</p>
                      <p className="text-sm font-bold text-white">₩{costModal.product.salePrice.toLocaleString()}</p>
                    </div>
                  </div>
                )
              })()}
              <div className="flex items-center gap-3 pt-1">
                <button onClick={saveCost} disabled={costSaving} className="bg-[#6366f1] hover:bg-[#5558e8] disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                  {costSaving ? '...' : 'Сохранить'}
                </button>
                {costMsg && <p className="text-xs text-emerald-400">{costMsg}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {historyProductId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setHistoryProductId(null)}>
          <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-2xl p-6 w-[500px] max-h-[75vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">История статусов</h3>
                {historyProduct && <p className="text-xs text-[#6b7280] mt-0.5 truncate">{historyProduct.name}</p>}
              </div>
              <button onClick={() => setHistoryProductId(null)} className="text-[#4b5563] hover:text-white transition-colors text-xl leading-none flex-shrink-0">×</button>
            </div>

            {historyLoading && (
              <div className="flex-1 flex items-center justify-center py-8">
                <div className="text-[#6b7280] text-sm">Загрузка...</div>
              </div>
            )}

            {!historyLoading && historyData && (
              <div className="overflow-y-auto space-y-2 flex-1">
                {historyData.length === 0 && <p className="text-xs text-[#6b7280] text-center py-6">История пуста</p>}
                {historyData.map((entry, i) => {
                  const ruLabel = entry.statusRu && entry.statusRu !== entry.status ? entry.statusRu : translateStatus(entry.status)
                  const colorClass = STATUS_COLORS[ruLabel] ?? 'text-[#9ca3af] border-[#2d3148] bg-[#12141f]'
                  return (
                    <div key={i} className="border-l-2 border-[#2d3148] pl-3 py-1.5">
                      <span className="text-[10px] text-[#4b5563] block mb-1">{entry.createdAt?.replace('T', ' ')}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block border px-2 py-0.5 rounded text-[11px] font-medium ${colorClass}`}>{ruLabel}</span>
                        <span className="text-[10px] text-[#4b5563]">{entry.status}</span>
                      </div>
                      {entry.comment && <p className="text-xs text-[#9ca3af] mt-1">{entry.comment}</p>}
                      <p className="text-[10px] text-[#4b5563] mt-0.5">{entry.createdByRu || entry.createdBy}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Товары</h1>
          {inflow && (
            <div className="flex items-center gap-2">
              <div className="text-xs text-[#6b7280]">
                <span className="text-white font-medium">{inflow.registeredCount.toLocaleString()}</span>
                {inflow.permittedCount !== null
                  ? <> из <span className="text-white font-medium">{inflow.permittedCount.toLocaleString()}</span></>
                  : ' зарегистрировано'
                }
                {' '}товаров
              </div>
              {inflow.permittedCount !== null && (
                <div className="w-24 h-1.5 bg-[#2d3148] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#6366f1] rounded-full"
                    style={{ width: `${Math.min(100, (inflow.registeredCount / inflow.permittedCount) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <Link href="/products/new" className="bg-[#6366f1] hover:bg-[#818cf8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + Создать товар
        </Link>
      </div>

      <div className="bg-[#1a1d2e] rounded-xl p-4 border border-[#2d3148] mb-4">
        <div className="flex items-center gap-3">
          <input
            className="flex-1 bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors placeholder-[#4b5563]"
            placeholder="Поиск по артикулу (externalVendorSku)..."
            value={skuSearch}
            onChange={e => { setSkuSearch(e.target.value); setSkuResult('not_found') }}
            onKeyDown={e => e.key === 'Enter' && searchBySku()}
          />
          <button
            onClick={searchBySku}
            disabled={skuResult === 'loading'}
            className="bg-[#6366f1] hover:bg-[#5457e0] disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors flex-shrink-0"
          >
            {skuResult === 'loading' ? '...' : 'Найти'}
          </button>
        </div>
        {skuResult && skuResult !== 'not_found' && skuResult !== 'loading' && (
          <div className="mt-3 flex items-center gap-3 p-3 bg-[#12141f] rounded-lg border border-[#2d3148]">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{skuResult.sellerProductName}</p>
              <p className="text-xs text-[#6b7280] mt-0.5">ID: {skuResult.sellerProductId} · {skuResult.brand ?? 'без бренда'} · создан {skuResult.createdAt?.slice(0, 10)}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {(() => { const ru = translateStatus(skuResult.statusName); const c = STATUS_COLORS[ru] ?? 'text-[#9ca3af] border-[#2d3148] bg-[#12141f]'; return <span className={`border px-2 py-0.5 rounded text-[10px] font-medium ${c}`}>{ru}</span> })()}
              <button
                onClick={() => router.push(`/products/${skuResult.sellerProductId}`)}
                className="text-[#6366f1] hover:text-[#818cf8] text-xs transition-colors"
              >
                Редактировать →
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['', 'ID', 'Название', 'Цена', 'Статус', ''].map((h, i) => (
                <th key={i} className="text-[10px] text-[#6b7280] uppercase tracking-wide px-3 py-2 text-left border-b border-[#2d3148]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(p => {
              const statusRu = translateStatus(p.status)
              const colorClass = STATUS_COLORS[statusRu] ?? 'text-[#9ca3af] border-[#2d3148] bg-[#12141f]'
              return (
                <tr key={p.id} onClick={() => router.push(`/products/${p.id}`)} className="border-b border-[#1e2233] last:border-0 hover:bg-[#1e2233] transition-colors cursor-pointer">
                  <td className="px-3 py-3">
                    <div className="w-16 h-16 rounded-xl bg-[#12141f] border border-[#2d3148] overflow-hidden flex items-center justify-center flex-shrink-0">
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        : <span className="text-[#3d4258] text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-[#6b7280]">{p.id}</td>
                  <td className="px-3 py-3 text-xs font-medium">{p.name}</td>
                  <td className="px-3 py-3 text-xs">₩{p.salePrice.toLocaleString()}</td>
                  <td className="px-3 py-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`border px-2 py-0.5 rounded text-[10px] font-medium ${colorClass}`}>{statusRu}</span>
                      <button
                        onClick={e => { e.stopPropagation(); openCostModal(p) }}
                        className="text-[10px] text-[#6b7280] hover:text-emerald-400 border border-[#2d3148] hover:border-emerald-500/40 px-2 py-0.5 rounded transition-colors"
                      >
                        ₩ Себестоимость
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={e => { e.stopPropagation(); openHistory(p.id) }}
                        className="text-[#4b5563] hover:text-[#9ca3af] text-xs transition-colors"
                      >
                        📋 История
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/products/${p.id}`) }}
                        className="text-[#6366f1] hover:text-[#818cf8] text-xs transition-colors"
                      >
                        Редактировать →
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {products.length === 0 && <p className="text-[#6b7280] text-sm text-center py-4">Нет данных. Запустите синхронизацию в Настройках.</p>}
      </div>
    </div>
  )
}
