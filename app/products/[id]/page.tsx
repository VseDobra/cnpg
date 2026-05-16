'use client'
import { useEffect, useState, KeyboardEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface ImageItem { order: number; type: string; url: string; isCdn: boolean }

interface ProductItem { vendorItemId: string; itemName: string }

interface ProductEdit {
  name: string
  displayName: string
  brand: string
  manufacturer: string
  salePrice: number
  originalPrice: number
  saleStartedAt: string
  saleEndedAt: string
  searchTags: string[]
  maximumBuyForPerson: number
  maximumBuyForPersonPeriod: number
  unitCount: number
  outboundShippingTimeDay: number
  barcode: string
  externalVendorSku: string
  modelNo: string
  weight: number
  netWeight: number
  width: number
  length: number
  height: number
  fragile: boolean
  distributionPeriod: number
  taxType: string
  adultOnly: string
  parallelImported: string
  offerCondition: string
  images: ImageItem[]
  description: string
  items: ProductItem[]
}

function translateStatus(s: string): string {
  if (!s) return s
  // translateCreatedBy works fine with Korean strings, so encoding is OK.
  // Match by encodeURIComponent to be 100% encoding-safe.
  const e = encodeURIComponent(s)
  if (e.includes('%EC%9E%84%EC%8B%9C%EC%A0%80%EC%9E%A5')) return 'Черновик'           // 임시저장
  if (e.includes('%EC%8A%B9%EC%9D%B8%EC%99%84%EB%A3%8C')) return 'Одобрен'            // 승인완료
  if (e.includes('%EC%9A%94%EC%B2%AD%20%ED%9B%84%20%EB%8C%80%EA%B8%B0%EC%A4%91')) return 'Ожидает одобрения' // 요청 후 대기중
  if (e.includes('%EC%8A%B9%EC%9D%B8%EB%8C%80%EA%B8%B0%EC%A4%91')) return 'Ожидает одобрения'  // 승인대기중
  if (e.includes('%EC%8A%B9%EC%9D%B8%EC%9A%94%EC%B2%AD')) return 'Запрос одобрения'   // 승인요청
  if (e.includes('%EC%8A%B9%EC%9D%B8%EA%B1%B0%EB%B6%80')) return 'Отклонён'           // 승인거부
  if (e.includes('%EB%B6%80%EB%B6%84%EC%8A%B9%EC%9D%B8')) return 'Частично одобрен'   // 부분승인
  if (e.includes('%EC%82%AD%EC%A0%9C')) return 'Удалён'                                // 삭제
  if (e.includes('%EA%B2%80%EC%88%98%EC%A4%91')) return 'На проверке'                  // 검수중
  if (s === 'SAVED') return 'Черновик'
  if (s === 'APPROVING') return 'Ожидает одобрения'
  if (s === 'IN_REVIEW') return 'На проверке'
  if (s === 'APPROVED') return 'Одобрен'
  if (s === 'PARTIAL_APPROVED') return 'Частично одобрен'
  if (s === 'DENIED') return 'Отклонён'
  if (s === 'DELETED') return 'Удалён'
  return s
}

function translateCreatedBy(s: string): string {
  if (!s) return s
  return s
    .replace('쿠팡 셀러 시스템', 'Coupang (система)')
    .replace('쿠팡셀러시스템', 'Coupang (система)')
}

const IMAGE_TYPES = ['REPRESENTATION', 'DETAIL', 'USED_PRODUCT']
const IMAGE_TYPE_LABELS: Record<string, string> = { REPRESENTATION: 'Главное', DETAIL: 'Доп.', USED_PRODUCT: 'Б/у' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
      <h2 className="text-sm font-medium text-[#9ca3af] mb-4">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[#6b7280] mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[#4b5563] mt-1">{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder }: { value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input
      type={type}
      className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

export default function ProductEditPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [form, setForm] = useState<ProductEdit | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [approving, setApproving] = useState(false)
  const [approveMsg, setApproveMsg] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [history, setHistory] = useState<Array<{ status: string; statusRu: string; comment: string; createdBy: string; createdByRu: string; createdAt: string }> | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [itemSalesLoading, setItemSalesLoading] = useState<Record<string, boolean>>({})
  const [itemSalesMsg, setItemSalesMsg] = useState<Record<string, string>>({})
  const [itemSalesConfirm, setItemSalesConfirm] = useState<{ vendorItemId: string; itemName: string; suspend: boolean } | null>(null)
  const [itemPriceInput, setItemPriceInput] = useState<Record<string, string>>({})
  const [itemPriceLoading, setItemPriceLoading] = useState<Record<string, boolean>>({})
  const [itemPriceMsg, setItemPriceMsg] = useState<Record<string, string>>({})
  const [itemOrigPriceInput, setItemOrigPriceInput] = useState<Record<string, string>>({})
  const [itemOrigPriceLoading, setItemOrigPriceLoading] = useState<Record<string, boolean>>({})
  const [itemOrigPriceMsg, setItemOrigPriceMsg] = useState<Record<string, string>>({})
  const [itemInventory, setItemInventory] = useState<Record<string, { amountInStock: number; salePrice: number; onSale: boolean } | null>>({})
  const [itemInventoryLoading, setItemInventoryLoading] = useState<Record<string, boolean>>({})
  const [autoGenLoading, setAutoGenLoading] = useState<Record<string, boolean>>({})
  const [autoGenMsg, setAutoGenMsg] = useState<Record<string, string>>({})
  const [costPriceStr, setCostPriceStr] = useState('')
  const [couponDiscountStr, setCouponDiscountStr] = useState('')
  const [commissionStr, setCommissionStr] = useState('10.8')
  const [adRateStr, setAdRateStr] = useState('5')
  const [taxRateStr, setTaxRateStr] = useState('10')
  const [rgDeliveryStr, setRgDeliveryStr] = useState('')
  const [costPriceSaving, setCostPriceSaving] = useState(false)
  const [costPriceMsg, setCostPriceMsg] = useState<string | null>(null)
  const [priceHistory, setPriceHistory] = useState<{ id: string; price: number; recordedAt: string }[]>([])
  const [naverCategoryId, setNaverCategoryId] = useState('')
  const [naverCategorySaving, setNaverCategorySaving] = useState(false)
  const [naverCategoryMsg, setNaverCategoryMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then(r => r.json())
      .then(data => { setForm(data); setLoading(false) })
      .catch(() => { setError('Не удалось загрузить данные товара'); setLoading(false) })
    fetch(`/api/products/${id}/cost`).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      setCostPriceStr(d.costPrice > 0 ? String(d.costPrice) : '')
      setCouponDiscountStr(d.couponDiscount > 0 ? String(d.couponDiscount) : '')
      if (d.commission != null) setCommissionStr(String(d.commission))
      if (d.adRate != null) setAdRateStr(String(d.adRate))
      if (d.taxRate != null) setTaxRateStr(String(d.taxRate))
      if (d.rgDelivery > 0) setRgDeliveryStr(String(d.rgDelivery))
      if (d.naverCategoryId) setNaverCategoryId(d.naverCategoryId)
    })
    fetch(`/api/products/${id}/price-history`).then(r => r.json()).then(setPriceHistory).catch(() => {})
  }, [id])

  async function loadItemInventory(vendorItemId: string) {
    setItemInventoryLoading(p => ({ ...p, [vendorItemId]: true }))
    try {
      const res = await fetch(`/api/products/${id}/items/${vendorItemId}/inventory`)
      const data = await res.json()
      setItemInventory(p => ({ ...p, [vendorItemId]: data.error ? null : data }))
    } catch {
      setItemInventory(p => ({ ...p, [vendorItemId]: null }))
    } finally {
      setItemInventoryLoading(p => ({ ...p, [vendorItemId]: false }))
    }
  }

  useEffect(() => {
    if (!form?.items?.length) return
    form.items.forEach(item => {
      if (item.vendorItemId) loadItemInventory(item.vendorItemId)
    })
  }, [form?.items?.map(i => i.vendorItemId).join(',')])

  async function save() {
    if (!form) return
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          displayName: form.displayName,
          brand: form.brand,
          manufacturer: form.manufacturer,
          price: form.salePrice,
          originalPrice: form.originalPrice,
          saleStartedAt: form.saleStartedAt,
          saleEndedAt: form.saleEndedAt,
          searchTags: form.searchTags,
          maximumBuyForPerson: form.maximumBuyForPerson,
          maximumBuyForPersonPeriod: form.maximumBuyForPersonPeriod,
          unitCount: form.unitCount,
          outboundShippingTimeDay: form.outboundShippingTimeDay,
          barcode: form.barcode,
          externalVendorSku: form.externalVendorSku,
          modelNo: form.modelNo,
          weight: form.weight,
          netWeight: form.netWeight,
          width: form.width,
          length: form.length,
          height: form.height,
          fragile: form.fragile,
          distributionPeriod: form.distributionPeriod,
          taxType: form.taxType,
          adultOnly: form.adultOnly,
          parallelImported: form.parallelImported,
          images: form.images,
          description: form.description,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Ошибка')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  function set<K extends keyof ProductEdit>(key: K, value: ProductEdit[K]) {
    setForm(f => f ? { ...f, [key]: value } : f)
  }

  function addTag() {
    const tag = tagInput.trim()
    if (!tag || !form) return
    if (form.searchTags.length >= 20) return
    if (form.searchTags.includes(tag)) { setTagInput(''); return }
    set('searchTags', [...form.searchTags, tag])
    setTagInput('')
  }

  function removeTag(tag: string) {
    if (!form) return
    set('searchTags', form.searchTags.filter(t => t !== tag))
  }

  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addTag() }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      router.push('/products')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления')
      setShowDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  async function activateAutoGen(vendorItemId: string) {
    setAutoGenLoading(p => ({ ...p, [vendorItemId]: true }))
    setAutoGenMsg(p => ({ ...p, [vendorItemId]: '' }))
    try {
      const res = await fetch(`/api/products/${id}/items/${vendorItemId}/auto-generated`, { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAutoGenMsg(p => ({ ...p, [vendorItemId]: '✓ Автогенерация опций включена' }))
      setTimeout(() => setAutoGenMsg(p => ({ ...p, [vendorItemId]: '' })), 4000)
    } catch (e) {
      setAutoGenMsg(p => ({ ...p, [vendorItemId]: e instanceof Error ? e.message : 'Ошибка' }))
    } finally {
      setAutoGenLoading(p => ({ ...p, [vendorItemId]: false }))
    }
  }

  async function changeItemOriginalPrice(vendorItemId: string) {
    const price = parseInt(itemOrigPriceInput[vendorItemId] ?? '')
    if (isNaN(price) || price < 0) { setItemOrigPriceMsg(p => ({ ...p, [vendorItemId]: 'Введите корректную цену (≥ 0)' })); return }
    setItemOrigPriceLoading(p => ({ ...p, [vendorItemId]: true }))
    setItemOrigPriceMsg(p => ({ ...p, [vendorItemId]: '' }))
    try {
      const res = await fetch(`/api/products/${id}/items/${vendorItemId}/original-price`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItemOrigPriceMsg(p => ({ ...p, [vendorItemId]: '✓ Зачёркнутая цена обновлена' }))
      setItemOrigPriceInput(p => ({ ...p, [vendorItemId]: '' }))
      setTimeout(() => setItemOrigPriceMsg(p => ({ ...p, [vendorItemId]: '' })), 3000)
    } catch (e) {
      setItemOrigPriceMsg(p => ({ ...p, [vendorItemId]: e instanceof Error ? e.message : 'Ошибка' }))
    } finally {
      setItemOrigPriceLoading(p => ({ ...p, [vendorItemId]: false }))
    }
  }

  async function changeItemPrice(vendorItemId: string) {
    const price = parseInt(itemPriceInput[vendorItemId] ?? '')
    if (!price || price < 10) { setItemPriceMsg(p => ({ ...p, [vendorItemId]: 'Минимум 10 вон' })); return }
    setItemPriceLoading(p => ({ ...p, [vendorItemId]: true }))
    setItemPriceMsg(p => ({ ...p, [vendorItemId]: '' }))
    try {
      const res = await fetch(`/api/products/${id}/items/${vendorItemId}/price`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItemPriceMsg(p => ({ ...p, [vendorItemId]: '✓ Цена обновлена' }))
      setItemPriceInput(p => ({ ...p, [vendorItemId]: '' }))
      setTimeout(() => setItemPriceMsg(p => ({ ...p, [vendorItemId]: '' })), 3000)
    } catch (e) {
      setItemPriceMsg(p => ({ ...p, [vendorItemId]: e instanceof Error ? e.message : 'Ошибка' }))
    } finally {
      setItemPriceLoading(p => ({ ...p, [vendorItemId]: false }))
    }
  }

  async function toggleItemSale(vendorItemId: string, suspend: boolean) {
    setItemSalesLoading(p => ({ ...p, [vendorItemId]: true }))
    setItemSalesMsg(p => ({ ...p, [vendorItemId]: '' }))
    try {
      const method = suspend ? 'DELETE' : 'PUT'
      const res = await fetch(`/api/products/${id}/items/${vendorItemId}/sales`, { method })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItemSalesMsg(p => ({ ...p, [vendorItemId]: suspend ? 'Продажи приостановлены' : 'Продажи возобновлены' }))
      setTimeout(() => setItemSalesMsg(p => ({ ...p, [vendorItemId]: '' })), 3000)
    } catch (e) {
      setItemSalesMsg(p => ({ ...p, [vendorItemId]: e instanceof Error ? e.message : 'Ошибка' }))
    } finally {
      setItemSalesLoading(p => ({ ...p, [vendorItemId]: false }))
    }
  }

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/products/${id}/history`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setHistory(data)
      setShowHistory(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки истории')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function requestApproval() {
    setApproving(true); setApproveMsg(null); setError(null)
    try {
      const res = await fetch(`/api/products/${id}/approve`, { method: 'PUT' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setApproveMsg('Запрос на одобрение отправлен')
      setTimeout(() => setApproveMsg(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setApproving(false)
    }
  }

  async function saveCostPrice() {
    setCostPriceSaving(true); setCostPriceMsg(null)
    try {
      await fetch(`/api/products/${id}/cost`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          costPrice: parseInt(costPriceStr) || 0,
          couponDiscount: parseInt(couponDiscountStr) || 0,
          commission: parseFloat(commissionStr) || 0,
          adRate: parseFloat(adRateStr) || 0,
          taxRate: parseFloat(taxRateStr) || 0,
          rgDelivery: parseInt(rgDeliveryStr) || 0,
        }),
      })
      setCostPriceMsg('✓ Сохранено')
      setTimeout(() => setCostPriceMsg(null), 3000)
    } catch {
      setCostPriceMsg('Ошибка сохранения')
    } finally {
      setCostPriceSaving(false)
    }
  }

  async function saveNaverCategoryId() {
    setNaverCategorySaving(true)
    setNaverCategoryMsg(null)
    const res = await fetch(`/api/products/${id}/cost`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naverCategoryId }),
    })
    setNaverCategorySaving(false)
    setNaverCategoryMsg(res.ok ? 'Сохранено' : 'Ошибка')
    setTimeout(() => setNaverCategoryMsg(null), 2000)
  }

  function updateImage(i: number, field: keyof ImageItem, value: string | number | boolean) {
    if (!form) return
    const imgs = [...form.images]
    imgs[i] = { ...imgs[i], [field]: value }
    if (field === 'url') imgs[i].isCdn = false
    set('images', imgs)
  }

  function addImage() {
    if (!form) return
    const nextOrder = form.images.length > 0 ? Math.max(...form.images.map(i => i.order)) + 1 : 0
    set('images', [...form.images, { order: nextOrder, type: 'DETAIL', url: '', isCdn: false }])
  }

  function removeImage(i: number) {
    if (!form) return
    set('images', form.images.filter((_, idx) => idx !== i))
  }

  if (loading) return <div className="flex items-center justify-center h-48 text-[#6b7280] text-sm">Загрузка...</div>
  if (!form) return <div className="flex items-center justify-center h-48 text-red-400 text-sm">{error ?? 'Ошибка'}</div>

  return (
    <div className="max-w-3xl mx-auto">

      {itemSalesConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-2xl p-6 w-80 shadow-2xl">
            <div className="text-2xl mb-3 text-center">{itemSalesConfirm.suspend ? '⏸' : '▶'}</div>
            <h3 className="text-sm font-semibold text-white text-center mb-2">
              {itemSalesConfirm.suspend ? 'Приостановить продажи?' : 'Возобновить продажи?'}
            </h3>
            <p className="text-xs text-[#6b7280] text-center mb-5">«{itemSalesConfirm.itemName}»</p>
            <div className="flex gap-3">
              <button onClick={() => setItemSalesConfirm(null)}
                className="flex-1 px-4 py-2 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] text-[#9ca3af] hover:text-white text-sm rounded-lg transition-colors">
                Отмена
              </button>
              <button
                onClick={() => { toggleItemSale(itemSalesConfirm.vendorItemId, itemSalesConfirm.suspend); setItemSalesConfirm(null) }}
                className={`flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${itemSalesConfirm.suspend ? 'bg-orange-600 hover:bg-orange-500' : 'bg-green-600 hover:bg-green-500'}`}
              >
                Да, {itemSalesConfirm.suspend ? 'приостановить' : 'возобновить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && history && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-2xl p-6 w-[480px] max-h-[70vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">История статусов</h3>
              <button onClick={() => setShowHistory(false)} className="text-[#4b5563] hover:text-white transition-colors text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto space-y-3 flex-1">
              {history.length === 0 && <p className="text-xs text-[#6b7280] text-center py-4">История пуста</p>}
              {history.map((entry, i) => (
                <div key={i} className="border-l-2 border-[#2d3148] pl-3 py-1">
                  <div className="mb-0.5">
                    <span className="text-[10px] text-[#4b5563] block mb-0.5">{entry.createdAt?.replace('T', ' ')}</span>
                    <span className="text-xs font-medium text-white">{entry.status}</span>
                    {entry.statusRu && entry.statusRu !== entry.status && (
                      <span className="text-xs text-[#6b7280] ml-1.5">— {entry.statusRu}</span>
                    )}
                  </div>
                  {entry.comment && <p className="text-xs text-[#9ca3af]">{entry.comment}</p>}
                  <p className="text-[10px] text-[#4b5563] mt-0.5">{entry.createdByRu || entry.createdBy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-2xl p-6 w-80 shadow-2xl">
            <div className="text-2xl mb-3 text-center">🗑</div>
            <h3 className="text-sm font-semibold text-white text-center mb-2">Удалить товар?</h3>
            <p className="text-xs text-[#6b7280] text-center mb-1">«{form.name}»</p>
            <p className="text-xs text-orange-400 text-center mb-5">Удалить можно только черновик у которого все опции приостановлены</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] text-[#9ca3af] hover:text-white text-sm rounded-lg transition-colors">
                Отмена
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {deleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/products')} className="text-[#6b7280] hover:text-white text-sm transition-colors">← Назад</button>
        <span className="text-[#2d3148]">/</span>
        <h1 className="text-lg font-semibold truncate">{form.name || 'Товар'}</h1>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={loadHistory}
            disabled={historyLoading}
            className="text-xs text-[#4b5563] hover:text-[#9ca3af] transition-colors disabled:opacity-40"
          >
            {historyLoading ? '...' : '📋 История'}
          </button>
          <button onClick={() => setShowDeleteConfirm(true)}
            className="text-xs text-[#4b5563] hover:text-red-400 transition-colors">
            🗑 Удалить
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Основная информация */}
        <Section title="Основная информация">
          <div className="space-y-4">
            <Field label="Название (внутреннее)" hint="Используется для заказов, не отображается покупателям">
              <Input value={form.name} onChange={v => set('name', v)} />
            </Field>
            <Field label="Название для отображения" hint="Отображается покупателям на странице товара на Coupang">
              <Input value={form.displayName} onChange={v => set('displayName', v)} placeholder="Оставьте пустым — будет использовано внутреннее название" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Бренд">
                <Input value={form.brand} onChange={v => set('brand', v)} />
              </Field>
              <Field label="Производитель">
                <Input value={form.manufacturer} onChange={v => set('manufacturer', v)} />
              </Field>
            </div>
          </div>
        </Section>

        {/* Цена */}
        <Section title="Цена">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Цена продажи (₩)">
                <Input type="number" value={form.salePrice} onChange={v => set('salePrice', parseInt(v) || 0)} />
              </Field>
              <Field label="Зачёркнутая цена (₩)" hint="Базовая цена для расчёта скидки">
                <Input type="number" value={form.originalPrice} onChange={v => set('originalPrice', parseInt(v) || 0)} />
              </Field>
            </div>
            {form.originalPrice > 0 && form.salePrice > 0 && form.originalPrice > form.salePrice && (
              <p className="text-xs text-[#6b7280]">Скидка: <span className="text-green-400 font-medium">{Math.round((1 - form.salePrice / form.originalPrice) * 100)}%</span></p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Кол-во единиц в упаковке" hint="Цена за единицу рассчитается автоматически">
                <Input type="number" value={form.unitCount} onChange={v => set('unitCount', parseInt(v) || 1)} />
              </Field>
              <Field label="Макс. кол-во на покупателя" hint="0 = без ограничений">
                <Input type="number" value={form.maximumBuyForPerson} onChange={v => set('maximumBuyForPerson', parseInt(v) || 0)} />
              </Field>
            </div>
          </div>
        </Section>



        {/* Идентификаторы */}
        <Section title="Идентификаторы">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Штрихкод (barcode)">
              <Input value={form.barcode} onChange={v => set('barcode', v)} placeholder="EAN, UPC..." />
            </Field>
            <Field label="Артикул продавца (SKU)">
              <Input value={form.externalVendorSku} onChange={v => set('externalVendorSku', v)} />
            </Field>
            <Field label="Номер модели">
              <Input value={form.modelNo} onChange={v => set('modelNo', v)} />
            </Field>
          </div>
        </Section>

        {/* Физические характеристики */}
        <Section title="Физические характеристики">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Field label="Вес, г">
              <Input type="number" value={form.weight} onChange={v => set('weight', parseFloat(v) || 0)} />
            </Field>
            <Field label="Чистый вес, г">
              <Input type="number" value={form.netWeight} onChange={v => set('netWeight', parseFloat(v) || 0)} />
            </Field>
            <Field label="Хрупкий товар">
              <select
                className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.fragile ? 'true' : 'false'}
                onChange={e => set('fragile', e.target.value === 'true')}
              >
                <option value="false">Нет</option>
                <option value="true">Да</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Field label="Ширина, мм">
              <Input type="number" value={form.width} onChange={v => set('width', parseFloat(v) || 0)} />
            </Field>
            <Field label="Длина, мм">
              <Input type="number" value={form.length} onChange={v => set('length', parseFloat(v) || 0)} />
            </Field>
            <Field label="Высота, мм">
              <Input type="number" value={form.height} onChange={v => set('height', parseFloat(v) || 0)} />
            </Field>
            <Field label="Срок годности, дни" hint="0 = без срока">
              <Input type="number" value={form.distributionPeriod} onChange={v => set('distributionPeriod', parseInt(v) || 0)} />
            </Field>
          </div>
        </Section>

        {/* Доставка */}
        <Section title="Доставка и ограничения">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Срок отгрузки, дней" hint="Через сколько дней после заказа">
              <Input type="number" value={form.outboundShippingTimeDay} onChange={v => set('outboundShippingTimeDay', parseInt(v) || 1)} />
            </Field>
            <Field label="Макс. кол-во за период" hint="0 = без ограничений">
              <Input type="number" value={form.maximumBuyForPersonPeriod} onChange={v => set('maximumBuyForPersonPeriod', parseInt(v) || 1)} />
            </Field>
            <Field label="Состояние товара" hint="Нельзя изменить после создания">
              <select
                className="w-full bg-[#12141f] border border-[#2d3148] rounded-lg px-3 py-2.5 text-sm text-white outline-none opacity-60 cursor-not-allowed"
                value={form.offerCondition}
                disabled
              >
                <option value="NEW">Новый</option>
                <option value="REFURBISHED">Восстановленный</option>
                <option value="USED_BEST">Б/у — отличное</option>
                <option value="USED_GOOD">Б/у — хорошее</option>
                <option value="USED_NORMAL">Б/у — нормальное</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* Прочие настройки */}
        <Section title="Прочие настройки">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Налог">
              <select
                className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.taxType}
                onChange={e => set('taxType', e.target.value)}
              >
                <option value="TAX">Облагается налогом</option>
                <option value="FREE">Без налога</option>
              </select>
            </Field>
            <Field label="Возрастное ограничение">
              <select
                className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.adultOnly}
                onChange={e => set('adultOnly', e.target.value)}
              >
                <option value="EVERYONE">Всем</option>
                <option value="ADULT_ONLY">18+</option>
              </select>
            </Field>
            <Field label="Параллельный импорт">
              <select
                className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.parallelImported}
                onChange={e => set('parallelImported', e.target.value)}
              >
                <option value="NOT_PARALLEL_IMPORTED">Нет</option>
                <option value="PARALLEL_IMPORTED">Да</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* Период продаж */}
        <Section title="Период продаж">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Начало продаж">
              <input
                type="datetime-local"
                className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
                value={form.saleStartedAt ? form.saleStartedAt.slice(0, 16) : ''}
                onChange={e => set('saleStartedAt', e.target.value ? e.target.value + ':00' : '')}
              />
            </Field>
            <Field label="Конец продаж" hint="Можно оставить пустым (до 2099 года)">
              <input
                type="datetime-local"
                className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
                value={form.saleEndedAt ? form.saleEndedAt.slice(0, 16) : ''}
                onChange={e => set('saleEndedAt', e.target.value ? e.target.value + ':00' : '')}
              />
            </Field>
          </div>
        </Section>

        {/* Ключевые слова */}
        <Section title="Ключевые слова для поиска">
          <div className="flex flex-wrap gap-2 mb-3 min-h-[28px]">
            {form.searchTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1.5 bg-[#12141f] border border-[#2d3148] rounded-full px-3 py-1 text-xs text-white">
                {tag}
                <button onClick={() => removeTag(tag)} className="text-[#4b5563] hover:text-red-400 transition-colors leading-none">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors"
              placeholder="Добавить ключевое слово и нажать Enter..."
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              maxLength={20}
            />
            <button
              onClick={addTag}
              className="bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] rounded-lg px-4 text-xs text-[#6b7280] hover:text-white transition-colors"
            >
              Добавить
            </button>
          </div>
          <p className="text-[10px] text-[#4b5563] mt-2">{form.searchTags.length}/20 ключевых слов, макс. 20 символов каждое</p>
        </Section>

        {/* Изображения */}
        <Section title="Изображения">
          <div className="space-y-3">
            {form.images.map((img, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg border border-[#2d3148] bg-[#12141f] overflow-hidden flex-shrink-0">
                  {img.url
                    ? <img src={img.url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : <div className="w-full h-full flex items-center justify-center text-[#4b5563] text-lg">?</div>
                  }
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors"
                    placeholder="URL изображения (https://...)"
                    value={img.url}
                    onChange={e => updateImage(i, 'url', e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <select
                      className="bg-[#12141f] border border-[#2d3148] rounded px-2 py-1 text-xs text-white outline-none"
                      value={img.type}
                      onChange={e => updateImage(i, 'type', e.target.value)}
                    >
                      {IMAGE_TYPES.map(t => <option key={t} value={t}>{IMAGE_TYPE_LABELS[t]}</option>)}
                    </select>
                    <span className="text-xs text-[#4b5563]">#{i + 1}</span>
                  </div>
                </div>
                <button onClick={() => removeImage(i)} className="text-[#4b5563] hover:text-red-400 transition-colors mt-1 text-xl leading-none">×</button>
              </div>
            ))}
            <button
              onClick={addImage}
              className="w-full border border-dashed border-[#2d3148] hover:border-[#6366f1] rounded-lg py-2.5 text-xs text-[#6b7280] hover:text-[#6366f1] transition-colors"
            >
              + Добавить изображение
            </button>
          </div>
          <p className="text-[10px] text-[#4b5563] mt-3">Главное изображение — квадрат JPG/PNG от 500×500 до 5000×5000px, до 3MB. Coupang автоматически скачает изображения по URL.</p>
        </Section>

        {/* Интеграции */}
        <Section title="Интеграции">
          <Field label="Naver DataLab — ID категории" hint="Найди в datalab.naver.com → Shopping Insight → URL параметр cid">
            <div className="flex gap-2">
              <Input
                value={naverCategoryId}
                onChange={setNaverCategoryId}
                placeholder="50000167"
              />
              <button
                onClick={saveNaverCategoryId}
                disabled={naverCategorySaving}
                className="px-3 py-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 rounded-lg text-xs text-white transition-colors whitespace-nowrap"
              >
                {naverCategorySaving ? '...' : 'Сохранить'}
              </button>
            </div>
            {naverCategoryMsg && (
              <p className="text-[11px] mt-1 text-green-400">{naverCategoryMsg}</p>
            )}
          </Field>
        </Section>

        {/* Описание */}
        <Section title="Описание товара">
          <textarea
            className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors resize-none"
            rows={6}
            placeholder="Текстовое описание товара..."
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
        </Section>
      </div>

      {/* Опции — suspend/resume */}
      {form.items.length > 0 && (
        <Section title="Управление продажами по опциям">
          <div className="space-y-3">
            {form.items.map(item => (
              <div key={item.vendorItemId} className="py-3 border-b border-[#2d3148] last:border-0 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => setItemSalesConfirm({ vendorItemId: item.vendorItemId, itemName: item.itemName, suspend: false })}
                      disabled={itemSalesLoading[item.vendorItemId]}
                      className="text-xs px-3 py-1.5 bg-[#12141f] border border-[#2d3148] hover:border-green-500/50 hover:text-green-400 text-[#9ca3af] rounded-lg transition-colors disabled:opacity-40"
                    >
                      ▶ Возобновить
                    </button>
                    <button
                      onClick={() => setItemSalesConfirm({ vendorItemId: item.vendorItemId, itemName: item.itemName, suspend: true })}
                      disabled={itemSalesLoading[item.vendorItemId]}
                      className="text-xs px-3 py-1.5 bg-[#12141f] border border-[#2d3148] hover:border-orange-500/50 hover:text-orange-400 text-[#9ca3af] rounded-lg transition-colors disabled:opacity-40"
                    >
                      ⏸ Приостановить
                    </button>
                  </div>
                  <div className="flex-1" />
                  <div className="text-right">
                    <div className="text-base font-medium text-white">{item.itemName}</div>
                    <div className="text-xs text-[#6b7280]">vendorItemId: {item.vendorItemId}</div>
                    {itemSalesMsg[item.vendorItemId] && (
                      <div className="text-[10px] text-green-400 mt-0.5">{itemSalesMsg[item.vendorItemId]}</div>
                    )}
                    {/* Live inventory data */}
                    {itemInventoryLoading[item.vendorItemId] ? (
                      <div className="mt-2 text-xs text-[#4b5563]">Загрузка...</div>
                    ) : itemInventory[item.vendorItemId] ? (() => {
                      const inv = itemInventory[item.vendorItemId]!
                      return (
                        <div className="flex items-center gap-3 justify-end mt-2 flex-wrap">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${inv.onSale ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-orange-400 border-orange-500/30 bg-orange-500/10'}`}>
                            {inv.onSale ? '● Продаётся' : '⏸ Приостановлен'}
                          </span>
                          <span className="text-sm font-medium text-white">₩{inv.salePrice.toLocaleString()}</span>
                          <span className="text-sm text-[#6b7280]">склад: <span className={inv.amountInStock <= 5 ? 'text-orange-400 font-bold' : 'text-white font-medium'}>{inv.amountInStock} шт</span></span>
                          <button onClick={() => loadItemInventory(item.vendorItemId)} className="text-sm text-[#4b5563] hover:text-[#9ca3af] transition-colors" title="Обновить">↻</button>
                        </div>
                      )
                    })() : null}
                  </div>
                </div>
                <div className="space-y-1.5 pl-1">
                  <p className="text-[10px] text-[#4b5563]">Применяется мгновенно, без повторного одобрения</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => activateAutoGen(item.vendorItemId)}
                      disabled={autoGenLoading[item.vendorItemId]}
                      className="text-xs px-3 py-1.5 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] hover:text-white text-[#9ca3af] disabled:opacity-40 rounded-lg transition-colors"
                    >
                      {autoGenLoading[item.vendorItemId] ? '...' : '📦 Автогенерация опций'}
                    </button>
                    <span className="text-[10px] text-[#4b5563]">покупатель увидит «купить 2 шт», «купить 3 шт» и т.д.</span>
                    {autoGenMsg[item.vendorItemId] && (
                      <span className={`text-xs ${autoGenMsg[item.vendorItemId].startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                        {autoGenMsg[item.vendorItemId]}
                      </span>
                    )}
                  </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    className="w-36 bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                    placeholder="Цена продажи ₩"
                    value={itemPriceInput[item.vendorItemId] ?? ''}
                    onChange={e => setItemPriceInput(p => ({ ...p, [item.vendorItemId]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && changeItemPrice(item.vendorItemId)}
                  />
                  <button
                    onClick={() => changeItemPrice(item.vendorItemId)}
                    disabled={itemPriceLoading[item.vendorItemId]}
                    className="text-xs px-3 py-1.5 bg-[#6366f1] hover:bg-[#5457e0] disabled:opacity-40 text-white rounded-lg transition-colors"
                  >
                    {itemPriceLoading[item.vendorItemId] ? '...' : 'Изменить цену'}
                  </button>
                  {itemPriceMsg[item.vendorItemId] && (
                    <span className={`text-xs ${itemPriceMsg[item.vendorItemId].startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                      {itemPriceMsg[item.vendorItemId]}
                    </span>
                  )}
                  <span className="text-[#2d3148] text-xs">|</span>
                  <input
                    type="number"
                    className="w-36 bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                    placeholder="Зачёркнутая ₩"
                    value={itemOrigPriceInput[item.vendorItemId] ?? ''}
                    onChange={e => setItemOrigPriceInput(p => ({ ...p, [item.vendorItemId]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && changeItemOriginalPrice(item.vendorItemId)}
                  />
                  <button
                    onClick={() => changeItemOriginalPrice(item.vendorItemId)}
                    disabled={itemOrigPriceLoading[item.vendorItemId]}
                    className="text-xs px-3 py-1.5 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] hover:text-white text-[#9ca3af] disabled:opacity-40 rounded-lg transition-colors"
                  >
                    {itemOrigPriceLoading[item.vendorItemId] ? '...' : 'Зачёркнутая'}
                  </button>
                  {itemOrigPriceMsg[item.vendorItemId] && (
                    <span className={`text-xs ${itemOrigPriceMsg[item.vendorItemId].startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                      {itemOrigPriceMsg[item.vendorItemId]}
                    </span>
                  )}
                </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Save bar */}
      <div className="sticky bottom-6 mt-5">
        <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl px-5 py-3 flex items-center justify-between shadow-lg">
          {error
            ? <p className="text-red-400 text-xs">{error}</p>
            : approveMsg
            ? <p className="text-green-400 text-xs">✓ {approveMsg}</p>
            : saved
            ? <p className="text-green-400 text-xs">Изменения сохранены в Coupang ✓</p>
            : <p className="text-[#6b7280] text-xs">Несохранённые изменения</p>
          }
          <div className="flex items-center gap-2">
            <button
              onClick={requestApproval}
              disabled={approving}
              className="bg-[#6366f1] hover:bg-[#5457e0] disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {approving ? 'Отправка...' : <><span className="text-green-400">✓</span> Запросить одобрение</>}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-[#6366f1] hover:bg-[#5457e0] disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Сохранение...' : '📝 Сохранить черновик'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
