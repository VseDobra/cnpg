'use client'
import { useEffect, useState, useRef, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { FlatCategory, CategoryMeta } from '@/lib/coupang/categories'
import { getCachedCategories, setCachedCategories } from '@/lib/categoryCache'

let VENDOR_ID = ''

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

function Input({ value, onChange, type = 'text', placeholder, required }: {
  value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <input
      type={type}
      required={required}
      className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {children}
    </select>
  )
}

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const defaultStart = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T00:00:00`
const defaultEnd = '2099-12-31T00:00:00'

const defaultForm = {
  sellerProductName: '',
  displayProductName: '',
  brand: '',
  generalProductName: '',
  manufacture: '',
  vendorUserId: '',
  saleStartedAt: defaultStart,
  saleEndedAt: defaultEnd,
  rfmInboundName: '',
  requested: false,
  searchTags: [] as string[],
  // item
  itemName: '',
  salePrice: 0,
  originalPrice: 0,
  maximumBuyForPerson: 0,
  maximumBuyForPersonPeriod: 1,
  outboundShippingTimeDay: 1,
  unitCount: 1,
  adultOnly: 'EVERYONE',
  taxType: 'TAX',
  parallelImported: 'NOT_PARALLEL_IMPORTED',
  overseasPurchased: 'NOT_OVERSEAS_PURCHASED',
  pccNeeded: false,
  offerCondition: 'NEW',
  barcode: '',
  emptyBarcode: false,
  emptyBarcodeReason: '',
  externalVendorSku: '',
  modelNo: '',
  weight: 0,
  netWeight: 0,
  width: 0,
  length: 0,
  height: 0,
  fragile: false,
  distributionPeriod: 0,
  images: [{ order: 0, type: 'REPRESENTATION', url: '', isCdn: false }] as Array<{ order: number; type: string; url: string; isCdn: boolean }>,
  description: '',
}

export default function NewProductPage() {
  const router = useRouter()
  const [form, setForm] = useState({ ...defaultForm })
  const [tagInput, setTagInput] = useState('')

  // category search
  const [categories, setCategories] = useState<FlatCategory[]>([])
  const [catQuery, setCatQuery] = useState('')
  const [showCatDrop, setShowCatDrop] = useState(false)
  const [selectedCat, setSelectedCat] = useState<FlatCategory | null>(null)
  const [catMeta, setCatMeta] = useState<CategoryMeta | null>(null)
  const catInputRef = useRef<HTMLInputElement>(null)
  const catDropRef = useRef<HTMLDivElement>(null)

  // auto category recommendation
  const [recommending, setRecommending] = useState(false)
  const [recommendError, setRecommendError] = useState<string | null>(null)

  // notices/certifications filled by user (dynamic from category)
  const [noticeValues, setNoticeValues] = useState<Record<string, string>>({})
  const [certValues, setCertValues] = useState<Record<string, string>>({})
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({})

  // vendorUserId — fetch from existing product
  const [vendorUserId, setVendorUserId] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = getCachedCategories()
    if (cached) {
      setCategories(cached)
    } else {
      fetch('/api/categories').then(r => r.json()).then((d: FlatCategory[]) => {
        if (Array.isArray(d)) { setCategories(d); setCachedCategories(d) }
      })
    }
    fetch('/api/vendor-info').then(r => r.json()).then(d => {
      if (d.vendorId) VENDOR_ID = d.vendorId
      if (d.vendorUserId) setVendorUserId(d.vendorUserId)
    })
  }, [])

  useEffect(() => {
    function click(e: MouseEvent) {
      if (catDropRef.current?.contains(e.target as Node) === false && catInputRef.current?.contains(e.target as Node) === false)
        setShowCatDrop(false)
    }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  const filteredCats = catQuery.trim().length < 2 ? [] :
    categories.filter(c => c.pathStr.toLowerCase().includes(catQuery.toLowerCase())).slice(0, 20)

  async function selectCat(cat: FlatCategory) {
    setSelectedCat(cat)
    setCatQuery(cat.pathStr)
    setShowCatDrop(false)
    setCatMeta(null)
    setNoticeValues({})
    setCertValues({})
    setAttributeValues({})
    const meta = await fetch(`/api/categories/${cat.code}/meta`).then(r => r.json()).catch(() => null)
    if (meta && !meta.error) {
      setCatMeta(meta)
      // pre-fill cert values with first cert type
      if (meta.certifications?.length > 0) {
        const cv: Record<string, string> = {}
        meta.certifications.forEach((c: { certificationType: string }) => { cv[c.certificationType] = '' })
        setCertValues(cv)
      }
    }
  }

  function set<K extends keyof typeof defaultForm>(key: K, value: (typeof defaultForm)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function addTag() {
    const t = tagInput.trim()
    if (!t || form.searchTags.length >= 20 || form.searchTags.includes(t)) { setTagInput(''); return }
    set('searchTags', [...form.searchTags, t])
    setTagInput('')
  }

  function updateImage(i: number, field: string, value: string | number | boolean) {
    const imgs = [...form.images]
    imgs[i] = { ...imgs[i], [field]: value }
    if (field === 'url') imgs[i].isCdn = false
    set('images', imgs)
  }

  async function recommendCategory() {
    if (!form.sellerProductName) { setRecommendError('Сначала введите название товара'); return }
    setRecommending(true); setRecommendError(null)
    try {
      const res = await fetch('/api/categories/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: form.sellerProductName, brand: form.brand || undefined })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.autoCategorizationPredictionResultType !== 'SUCCESS') {
        throw new Error('Не удалось определить категорию — уточните название товара')
      }
      // find category in loaded list
      const code = Number(data.predictedCategoryId)
      const found = categories.find(c => c.code === code)
      if (found) {
        await selectCat(found)
      } else {
        // category not in RFM list — show name only
        setRecommendError(`Coupang рекомендует: ${data.predictedCategoryName} (код ${data.predictedCategoryId}) — но эта категория недоступна для RFM`)
      }
    } catch (e) {
      setRecommendError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setRecommending(false)
    }
  }

  async function submit() {
    if (!selectedCat) { setError('Выберите категорию'); return }
    if (!form.sellerProductName) { setError('Введите название товара'); return }
    if (!form.itemName) { setError('Введите название опции (itemName)'); return }
    if (form.salePrice <= 0) { setError('Введите цену продажи'); return }
    if (!form.images[0]?.url) { setError('Добавьте хотя бы одно главное изображение'); return }

    setSaving(true); setError(null)
    try {
      // build notices from catMeta
      const notices: Array<{ noticeCategoryName: string; noticeCategoryDetailName: string; content: string }> = []
      catMeta?.noticeCategories.forEach(nc => {
        nc.noticeCategoryDetailNames.forEach(d => {
          notices.push({ noticeCategoryName: nc.noticeCategoryName, noticeCategoryDetailName: d.noticeCategoryDetailName, content: noticeValues[`${nc.noticeCategoryName}|${d.noticeCategoryDetailName}`] ?? '' })
        })
      })

      // build certifications
      const certifications = catMeta?.certifications
        ? catMeta.certifications.slice(0, 1).map(c => ({ certificationType: c.certificationType, certificationCode: certValues[c.certificationType] ?? '' }))
        : [{ certificationType: 'NOT_REQUIRED', certificationCode: '' }]

      // build attributes
      const attributes = catMeta?.attributes
        ? catMeta.attributes
            .filter(a => attributeValues[a.attributeTypeName])
            .map(a => ({ attributeTypeName: a.attributeTypeName, attributeValueName: attributeValues[a.attributeTypeName], exposed: a.exposed }))
        : []

      const payload = {
        ...form,
        vendorId: VENDOR_ID,
        vendorUserId,
        displayCategoryCode: selectedCat.code,
        notices,
        certifications,
        attributes,
      }

      const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      router.push('/products')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/products')} className="text-[#6b7280] hover:text-white text-sm transition-colors">← Назад</button>
        <span className="text-[#2d3148]">/</span>
        <h1 className="text-lg font-semibold">Создать товар</h1>
      </div>

      <div className="space-y-5">

        {/* Category */}
        <Section title="Категория Coupang">
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={recommendCategory}
              disabled={recommending || !form.sellerProductName}
              className="text-xs bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] disabled:opacity-40 text-[#9ca3af] hover:text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            >
              {recommending ? '⏳ Определяю...' : '✨ Подобрать по названию товара'}
            </button>
            {recommendError && <p className="text-xs text-red-400 self-center">{recommendError}</p>}
          </div>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b7280] text-sm">🔍</span>
            <input
              ref={catInputRef}
              className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white outline-none transition-colors"
              placeholder="Поиск категории..."
              value={catQuery}
              onChange={e => { setCatQuery(e.target.value); setShowCatDrop(true) }}
              onFocus={() => filteredCats.length > 0 && setShowCatDrop(true)}
            />
            {showCatDrop && filteredCats.length > 0 && (
              <div ref={catDropRef} className="absolute z-50 top-full mt-1 w-full bg-[#1a1d2e] border border-[#2d3148] rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                {filteredCats.map(cat => (
                  <button key={cat.code} className="w-full text-left px-4 py-2.5 hover:bg-[#232640] border-b border-[#2d3148] last:border-0" onClick={() => selectCat(cat)}>
                    <div className="text-xs text-white">{cat.pathStr}</div>
                    <div className="text-[10px] text-[#4b5563]">Код: {cat.code}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedCat && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-green-400">✓ {selectedCat.pathStr}</span>
              <span className="text-[10px] text-[#4b5563]">#{selectedCat.code}</span>
              {catMeta?.isExpirationDateRequiredForRocketGrowth && (
                <span className="text-[10px] text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full">⚠ Нужен срок годности</span>
              )}
            </div>
          )}
        </Section>

        {/* Основное */}
        <Section title="Основная информация">
          <div className="space-y-4">
            <Field label="Название товара (внутреннее) *" hint="Используется в заказах, макс. 100 символов">
              <Input value={form.sellerProductName} onChange={v => set('sellerProductName', v)} required />
            </Field>
            <Field label="Название для отображения" hint="Показывается покупателям. Если пусто — используется внутреннее название">
              <Input value={form.displayProductName} onChange={v => set('displayProductName', v)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Бренд"><Input value={form.brand} onChange={v => set('brand', v)} /></Field>
              <Field label="Производитель"><Input value={form.manufacture} onChange={v => set('manufacture', v)} /></Field>
            </div>
            <Field label="Общее название товара" hint="Название без опций (размер, цвет и т.д.)">
              <Input value={form.generalProductName} onChange={v => set('generalProductName', v)} />
            </Field>
            <Field label="Название опции (itemName) *" hint="Напр.: 'Стандарт', '100г', 'Красный'">
              <Input value={form.itemName} onChange={v => set('itemName', v)} required />
            </Field>
          </div>
        </Section>

        {/* Цена */}
        <Section title="Цена">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Цена продажи (₩) *">
              <Input type="number" value={form.salePrice} onChange={v => set('salePrice', parseInt(v) || 0)} required />
            </Field>
            <Field label="Зачёркнутая цена (₩)" hint="0 = отображается как 'Цена Coupang'">
              <Input type="number" value={form.originalPrice} onChange={v => set('originalPrice', parseInt(v) || 0)} />
            </Field>
          </div>
        </Section>

        {/* Период продаж */}
        <Section title="Период продаж">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Начало продаж">
              <input type="datetime-local" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.saleStartedAt.slice(0, 16)} onChange={e => set('saleStartedAt', e.target.value + ':00')} />
            </Field>
            <Field label="Конец продаж">
              <input type="datetime-local" className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                value={form.saleEndedAt.slice(0, 16)} onChange={e => set('saleEndedAt', e.target.value + ':00')} />
            </Field>
          </div>
        </Section>

        {/* Идентификаторы */}
        <Section title="Идентификаторы">
          <div className="space-y-3">
            <div className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.emptyBarcode} onChange={e => set('emptyBarcode', e.target.checked)} className="accent-[#6366f1]" />
                <span className="text-xs text-[#9ca3af]">Нет штрихкода</span>
              </label>
            </div>
            {form.emptyBarcode ? (
              <Field label="Причина (AUTO_GENERATED = сгенерировать Coupang)">
                <Input value={form.emptyBarcodeReason} onChange={v => set('emptyBarcodeReason', v)} placeholder="AUTO_GENERATED" />
              </Field>
            ) : (
              <Field label="Штрихкод"><Input value={form.barcode} onChange={v => set('barcode', v)} placeholder="EAN, UPC..." /></Field>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Артикул продавца (SKU)"><Input value={form.externalVendorSku} onChange={v => set('externalVendorSku', v)} /></Field>
              <Field label="Номер модели"><Input value={form.modelNo} onChange={v => set('modelNo', v)} /></Field>
            </div>
          </div>
        </Section>

        {/* Физические */}
        <Section title="Физические характеристики">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Field label="Вес, г"><Input type="number" value={form.weight} onChange={v => set('weight', parseFloat(v) || 0)} /></Field>
            <Field label="Чистый вес, г"><Input type="number" value={form.netWeight} onChange={v => set('netWeight', parseFloat(v) || 0)} /></Field>
            <Field label="Хрупкий">
              <Select value={form.fragile ? 'true' : 'false'} onChange={v => set('fragile', v === 'true')}>
                <option value="false">Нет</option><option value="true">Да</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Field label="Ширина, мм"><Input type="number" value={form.width} onChange={v => set('width', parseFloat(v) || 0)} /></Field>
            <Field label="Длина, мм"><Input type="number" value={form.length} onChange={v => set('length', parseFloat(v) || 0)} /></Field>
            <Field label="Высота, мм"><Input type="number" value={form.height} onChange={v => set('height', parseFloat(v) || 0)} /></Field>
            <Field label="Срок годности, дни" hint="0 = нет срока">
              <Input type="number" value={form.distributionPeriod} onChange={v => set('distributionPeriod', parseInt(v) || 0)} />
            </Field>
          </div>
        </Section>

        {/* Настройки */}
        <Section title="Прочие настройки">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Кол-во в упаковке"><Input type="number" value={form.unitCount} onChange={v => set('unitCount', parseInt(v) || 1)} /></Field>
            <Field label="Макс. кол-во на покупателя" hint="0 = без ограничений">
              <Input type="number" value={form.maximumBuyForPerson} onChange={v => set('maximumBuyForPerson', parseInt(v) || 0)} />
            </Field>
            <Field label="Срок отгрузки, дней"><Input type="number" value={form.outboundShippingTimeDay} onChange={v => set('outboundShippingTimeDay', parseInt(v) || 1)} /></Field>
            <Field label="Налог">
              <Select value={form.taxType} onChange={v => set('taxType', v)}>
                <option value="TAX">Облагается</option><option value="FREE">Без налога</option>
              </Select>
            </Field>
            <Field label="Возраст">
              <Select value={form.adultOnly} onChange={v => set('adultOnly', v)}>
                <option value="EVERYONE">Всем</option><option value="ADULT_ONLY">18+</option>
              </Select>
            </Field>
            <Field label="Параллельный импорт">
              <Select value={form.parallelImported} onChange={v => set('parallelImported', v)}>
                <option value="NOT_PARALLEL_IMPORTED">Нет</option><option value="PARALLEL_IMPORTED">Да</option>
              </Select>
            </Field>
          </div>
        </Section>

        {/* Изображения */}
        <Section title="Изображения">
          <div className="space-y-3">
            {form.images.map((img, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg border border-[#2d3148] bg-[#12141f] overflow-hidden flex-shrink-0">
                  {img.url ? <img src={img.url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /> : <div className="w-full h-full flex items-center justify-center text-[#4b5563]">?</div>}
                </div>
                <div className="flex-1 space-y-2">
                  <input className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-xs text-white outline-none"
                    placeholder="URL изображения (https://...)" value={img.url} onChange={e => updateImage(i, 'url', e.target.value)} />
                  <select className="bg-[#12141f] border border-[#2d3148] rounded px-2 py-1 text-xs text-white outline-none"
                    value={img.type} onChange={e => updateImage(i, 'type', e.target.value)}>
                    <option value="REPRESENTATION">Главное</option>
                    <option value="DETAIL">Доп.</option>
                    <option value="USED_PRODUCT">Б/у</option>
                  </select>
                </div>
                {i > 0 && <button onClick={() => set('images', form.images.filter((_, j) => j !== i))} className="text-[#4b5563] hover:text-red-400 text-xl leading-none mt-1">×</button>}
              </div>
            ))}
            <button onClick={() => set('images', [...form.images, { order: form.images.length, type: 'DETAIL', url: '', isCdn: false }])}
              className="w-full border border-dashed border-[#2d3148] hover:border-[#6366f1] rounded-lg py-2.5 text-xs text-[#6b7280] hover:text-[#6366f1] transition-colors">
              + Добавить изображение
            </button>
          </div>
        </Section>

        {/* Ключевые слова */}
        <Section title="Ключевые слова">
          <div className="flex flex-wrap gap-2 mb-3 min-h-[28px]">
            {form.searchTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1.5 bg-[#12141f] border border-[#2d3148] rounded-full px-3 py-1 text-xs text-white">
                {tag}
                <button onClick={() => set('searchTags', form.searchTags.filter(t => t !== tag))} className="text-[#4b5563] hover:text-red-400 leading-none">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="flex-1 bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none"
              placeholder="Добавить и нажать Enter..." value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} />
            <button onClick={addTag} className="bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] rounded-lg px-4 text-xs text-[#6b7280] hover:text-white transition-colors">+</button>
          </div>
        </Section>

        {/* Описание */}
        <Section title="Описание товара">
          <textarea className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none resize-none"
            rows={5} placeholder="Текстовое описание..." value={form.description} onChange={e => set('description', e.target.value)} />
        </Section>

        {/* Notices (dynamic from category) */}
        {catMeta && catMeta.noticeCategories.length > 0 && (
          <Section title="Обязательные поля описания (по закону Кореи)">
            <div className="space-y-4">
              {catMeta.noticeCategories.map(nc => (
                <div key={nc.noticeCategoryName}>
                  <div className="text-xs text-[#6b7280] mb-2">{nc.noticeCategoryName}</div>
                  <div className="space-y-2 pl-3 border-l border-[#2d3148]">
                    {nc.noticeCategoryDetailNames.map(d => (
                      <Field key={d.noticeCategoryDetailName} label={`${d.noticeCategoryDetailName}${d.required === 'MANDATORY' ? ' *' : ''}`}>
                        <Input value={noticeValues[`${nc.noticeCategoryName}|${d.noticeCategoryDetailName}`] ?? ''}
                          onChange={v => setNoticeValues(prev => ({ ...prev, [`${nc.noticeCategoryName}|${d.noticeCategoryDetailName}`]: v }))} />
                      </Field>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Attributes (dynamic) */}
        {catMeta && catMeta.attributes.filter(a => a.required === 'MANDATORY').length > 0 && (
          <Section title="Атрибуты (обязательные)">
            <div className="space-y-3">
              {catMeta.attributes.filter(a => a.required === 'MANDATORY').map(attr => (
                <Field key={attr.attributeTypeName} label={`${attr.attributeTypeName}${attr.basicUnit && attr.basicUnit !== '없음' ? ` (${attr.basicUnit})` : ''} *`}>
                  <Input value={attributeValues[attr.attributeTypeName] ?? ''}
                    onChange={v => setAttributeValues(prev => ({ ...prev, [attr.attributeTypeName]: v }))} />
                </Field>
              ))}
            </div>
          </Section>
        )}

        {/* RFM настройки */}
        <Section title="Rocket Growth настройки">
          <div className="space-y-4">
            <Field label="Название для входящей поставки (rfmInboundName)" hint="Если пусто — будет использовано название товара">
              <Input value={form.rfmInboundName} onChange={v => set('rfmInboundName', v)} />
            </Field>
            <Field label="Coupang Wing User ID" hint="Заполняется автоматически из существующего товара">
              <Input value={vendorUserId} onChange={v => setVendorUserId(v)} placeholder="Например: et5rod_sat" />
            </Field>
            <div className="flex items-center gap-3 p-3 bg-[#12141f] rounded-lg border border-[#2d3148]">
              <input type="checkbox" id="requested" checked={form.requested} onChange={e => set('requested', e.target.checked)} className="accent-[#6366f1]" />
              <div>
                <label htmlFor="requested" className="text-sm text-white cursor-pointer">Запросить одобрение сразу</label>
                <p className="text-[10px] text-[#4b5563] mt-0.5">Если не отмечено — товар сохранится как черновик, одобрить можно через Coupang Wing</p>
              </div>
            </div>
          </div>
        </Section>

      </div>

      {/* Save bar */}
      <div className="sticky bottom-6 mt-5">
        <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl px-5 py-3 flex items-center justify-between shadow-lg">
          {error ? <p className="text-red-400 text-xs">{error}</p> : <p className="text-[#6b7280] text-xs">Заполните обязательные поля и нажмите создать</p>}
          <button onClick={submit} disabled={saving}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
            {saving ? 'Создание...' : '+ Создать товар'}
          </button>
        </div>
      </div>
    </div>
  )
}
