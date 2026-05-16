'use client'
import { useEffect, useState, useRef } from 'react'
import type { FlatCategory, CategoryMeta } from '@/lib/coupang/categories'
import { getCachedCategories, setCachedCategories } from '@/lib/categoryCache'

const OFFER_CONDITION_LABELS: Record<string, string> = {
  NEW: 'Новый',
  REFURBISHED: 'Восстановленный',
  USED_BEST: 'Б/у — отличное',
  USED_GOOD: 'Б/у — хорошее',
  USED_NORMAL: 'Б/у — нормальное',
}

const REQ_COLORS: Record<string, string> = {
  MANDATORY: 'text-red-400 bg-red-400/10 border-red-400/20',
  RECOMMEND: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  OPTIONAL: 'text-[#4b5563] bg-transparent border-[#2d3148]',
  MANDATORY_PARALLEL_IMPORTED: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  MANDATORY_OVERSEAS_PURCHASED: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
}

const REQ_LABELS: Record<string, string> = {
  MANDATORY: 'Обязательно',
  RECOMMEND: 'Рекомендуется',
  OPTIONAL: 'Необязательно',
  MANDATORY_PARALLEL_IMPORTED: 'Обяз. (парал. импорт)',
  MANDATORY_OVERSEAS_PURCHASED: 'Обяз. (зарубеж. покупка)',
}

function Badge({ req }: { req: string }) {
  const color = REQ_COLORS[req] ?? REQ_COLORS.OPTIONAL
  const label = REQ_LABELS[req] ?? req
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${color}`}>{label}</span>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#2d3148] flex items-center gap-2">
        <span>{icon}</span>
        <h2 className="text-sm font-medium text-white">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function ResearchPage() {
  const [categories, setCategories] = useState<FlatCategory[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [catsError, setCatsError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selected, setSelected] = useState<FlatCategory | null>(null)
  const [meta, setMeta] = useState<CategoryMeta | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // AI recommendation
  const [recommending, setRecommending] = useState(false)
  const [recommendResult, setRecommendResult] = useState<{ name: string; code: string } | null>(null)
  const [recommendError, setRecommendError] = useState<string | null>(null)

  // manual code search
  const [codeInput, setCodeInput] = useState('')

  useEffect(() => {
    const cached = getCachedCategories()
    if (cached) {
      setCategories(cached)
      setLoadingCats(false)
      return
    }
    fetch('/api/categories')
      .then(r => r.json())
      .then((data: FlatCategory[] | { error: string }) => {
        if (!Array.isArray(data)) {
          setCatsError((data as { error: string }).error ?? 'Неизвестная ошибка')
        } else {
          setCategories(data)
          setCachedCategories(data)
        }
        setLoadingCats(false)
      })
      .catch(e => { setCatsError(String(e)); setLoadingCats(false) })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query.trim().length < 2
    ? []
    : categories
        .filter(c => c.pathStr.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 25)

  async function loadMetaByCode(code: number, label?: string) {
    setSelected({ code, name: label ?? String(code), path: [label ?? String(code)], pathStr: label ?? String(code) })
    setShowDropdown(false)
    setMeta(null); setMetaError(null); setLoadingMeta(true)
    try {
      const res = await fetch(`/api/categories/${code}/meta`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMeta(data)
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoadingMeta(false)
    }
  }

  async function runRecommend() {
    if (!query.trim()) return
    setRecommending(true); setRecommendResult(null); setRecommendError(null)
    try {
      const res = await fetch('/api/categories/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: query })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.autoCategorizationPredictionResultType !== 'SUCCESS') {
        throw new Error('Coupang не смог определить категорию — попробуйте более подробное название')
      }
      const code = Number(data.predictedCategoryId)
      const found = categories.find(c => c.code === code)
      if (found) {
        await selectCategory(found)
      } else {
        setRecommendResult({ name: data.predictedCategoryName, code: data.predictedCategoryId })
      }
    } catch (e) {
      setRecommendError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setRecommending(false)
    }
  }

  async function selectCategory(cat: FlatCategory) {
    setSelected(cat)
    setQuery(cat.pathStr)
    setShowDropdown(false)
    setMeta(null)
    setMetaError(null)
    setLoadingMeta(true)
    try {
      const res = await fetch(`/api/categories/${cat.code}/meta`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMeta(data)
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoadingMeta(false)
    }
  }

  const mandatoryCerts = meta?.certifications.filter(c => c.required === 'MANDATORY') ?? []
  const recommendCerts = meta?.certifications.filter(c => c.required === 'RECOMMEND') ?? []
  const optionalCerts = meta?.certifications.filter(c => c.required === 'OPTIONAL') ?? []
  const mandatoryDocs = meta?.requiredDocumentNames.filter(d => d.required.startsWith('MANDATORY')) ?? []
  const optionalDocs = meta?.requiredDocumentNames.filter(d => !d.required.startsWith('MANDATORY')) ?? []
  const mandatoryAttrs = meta?.attributes.filter(a => a.required === 'MANDATORY') ?? []
  const optionalAttrs = meta?.attributes.filter(a => a.required !== 'MANDATORY') ?? []

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold mb-1">Ресёрч категории</h1>
        <p className="text-sm text-[#6b7280]">Найди категорию и узнай все требования Coupang перед запуском товара</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b7280] text-sm">🔍</span>
          <input
            ref={inputRef}
            className="w-full bg-[#1a1d2e] border border-[#2d3148] focus:border-[#6366f1] rounded-xl pl-9 pr-4 py-3 text-sm text-white outline-none transition-colors"
            placeholder={loadingCats ? 'Загрузка категорий...' : `Поиск по-корейски или по-английски (${categories.length} категорий)...`}
            value={query}
            disabled={loadingCats}
            onChange={e => { setQuery(e.target.value); setShowDropdown(true); if (!e.target.value) { setSelected(null); setMeta(null) } }}
            onFocus={() => { if (filtered.length > 0) setShowDropdown(true) }}
          />
          {query && (
            <button
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-white text-lg leading-none"
              onClick={() => { setQuery(''); setSelected(null); setMeta(null); setShowDropdown(false) }}
            >×</button>
          )}
        </div>

        {showDropdown && filtered.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 top-full mt-1 w-full bg-[#1a1d2e] border border-[#2d3148] rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto"
          >
            {filtered.map(cat => (
              <button
                key={cat.code}
                className="w-full text-left px-4 py-2.5 hover:bg-[#232640] transition-colors border-b border-[#2d3148] last:border-0"
                onClick={() => selectCategory(cat)}
              >
                <div className="text-xs text-white leading-snug">{cat.pathStr}</div>
                <div className="text-[10px] text-[#4b5563] mt-0.5">Код: {cat.code}</div>
              </button>
            ))}
          </div>
        )}

        {showDropdown && query.trim().length >= 2 && filtered.length === 0 && !loadingCats && (
          <div className="absolute z-50 top-full mt-1 w-full bg-[#1a1d2e] border border-[#2d3148] rounded-xl px-4 py-4 space-y-3">
            <p className="text-sm text-[#6b7280]">Категории не найдены в RFM-списке</p>
            <button
              onClick={() => { setShowDropdown(false); runRecommend() }}
              disabled={recommending}
              className="w-full text-left flex items-center gap-2 bg-[#12141f] hover:bg-[#1e2233] border border-[#2d3148] hover:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-[#9ca3af] hover:text-white transition-colors"
            >
              <span>✨</span>
              <span>{recommending ? 'Спрашиваю у Coupang AI...' : 'Спросить у Coupang AI — какая категория подходит?'}</span>
            </button>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2 text-sm text-white outline-none"
                placeholder="Или введите код категории вручную..."
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && codeInput) { setShowDropdown(false); loadMetaByCode(Number(codeInput)) } }}
              />
              <button
                onClick={() => { if (codeInput) { setShowDropdown(false); loadMetaByCode(Number(codeInput)) } }}
                className="bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] rounded-lg px-3 py-2 text-xs text-[#6b7280] hover:text-white transition-colors"
              >→</button>
            </div>
          </div>
        )}
      </div>

      {/* AI recommendation result (when category not in RFM list) */}
      {recommendResult && !selected && (
        <div className="mb-4 bg-[#1a1d2e] border border-[#6366f1]/40 rounded-xl px-5 py-4">
          <div className="text-xs text-[#6b7280] mb-1">✨ Coupang AI рекомендует категорию:</div>
          <div className="text-sm text-white font-medium mb-1">{recommendResult.name}</div>
          <div className="text-xs text-[#4b5563] mb-3">Код: {recommendResult.code} (не в RFM-списке, но можно загрузить требования)</div>
          <button
            onClick={() => loadMetaByCode(Number(recommendResult.code), recommendResult.name)}
            className="text-xs bg-[#6366f1] hover:bg-[#818cf8] text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Загрузить требования для этой категории →
          </button>
        </div>
      )}
      {recommendError && !selected && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-3 text-red-400 text-sm">{recommendError}</div>
      )}

      {/* Selected category header */}
      {selected && (
        <div className="mb-4 px-4 py-3 bg-[#1e2a4a] border border-[#2d4a6b] rounded-xl text-xs text-blue-300">
          <span className="text-[#6b7280]">Категория: </span>
          {selected.path.map((p, i) => (
            <span key={i}>
              {i > 0 && <span className="text-[#4b5563] mx-1">›</span>}
              <span className={i === selected.path.length - 1 ? 'text-white font-medium' : ''}>{p}</span>
            </span>
          ))}
          <span className="ml-2 text-[#4b5563]">#{selected.code}</span>
        </div>
      )}

      {/* Loading */}
      {loadingMeta && (
        <div className="text-center py-16 text-[#6b7280] text-sm">Загрузка требований...</div>
      )}

      {/* Error */}
      {metaError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 text-red-400 text-sm">{metaError}</div>
      )}

      {/* Meta sections */}
      {meta && !loadingMeta && (
        <div className="space-y-4">

          {/* Quick summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-xl border p-4 text-center ${meta.isExpirationDateRequiredForRocketGrowth ? 'bg-red-400/10 border-red-400/20' : 'bg-[#1a1d2e] border-[#2d3148]'}`}>
              <div className="text-lg mb-1">{meta.isExpirationDateRequiredForRocketGrowth ? '⚠️' : '✅'}</div>
              <div className="text-xs text-[#9ca3af]">Срок годности</div>
              <div className={`text-xs font-medium mt-0.5 ${meta.isExpirationDateRequiredForRocketGrowth ? 'text-red-400' : 'text-green-400'}`}>
                {meta.isExpirationDateRequiredForRocketGrowth ? 'Обязателен' : 'Не нужен'}
              </div>
            </div>
            <div className={`rounded-xl border p-4 text-center ${mandatoryDocs.length > 0 ? 'bg-orange-400/10 border-orange-400/20' : 'bg-[#1a1d2e] border-[#2d3148]'}`}>
              <div className="text-lg mb-1">{mandatoryDocs.length > 0 ? '📄' : '✅'}</div>
              <div className="text-xs text-[#9ca3af]">Документы</div>
              <div className={`text-xs font-medium mt-0.5 ${mandatoryDocs.length > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                {mandatoryDocs.length > 0 ? `${mandatoryDocs.length} обязательных` : 'Не требуются'}
              </div>
            </div>
            <div className={`rounded-xl border p-4 text-center ${mandatoryCerts.length > 0 ? 'bg-red-400/10 border-red-400/20' : 'bg-[#1a1d2e] border-[#2d3148]'}`}>
              <div className="text-lg mb-1">{mandatoryCerts.length > 0 ? '🏅' : '✅'}</div>
              <div className="text-xs text-[#9ca3af]">Сертификаты</div>
              <div className={`text-xs font-medium mt-0.5 ${mandatoryCerts.length > 0 ? 'text-red-400' : recommendCerts.length > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                {mandatoryCerts.length > 0 ? `${mandatoryCerts.length} обязательных` : recommendCerts.length > 0 ? `${recommendCerts.length} рекомендованных` : 'Не требуются'}
              </div>
            </div>
          </div>

          {/* Documents */}
          <Section title="Документы" icon="📄">
            {meta.requiredDocumentNames.length === 0
              ? <p className="text-sm text-[#4b5563]">Дополнительные документы не требуются</p>
              : <div className="space-y-2">
                  {[...mandatoryDocs, ...optionalDocs].map((doc, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-[#2d3148] last:border-0">
                      <span className="text-sm text-white">{doc.templateName}</span>
                      <Badge req={doc.required} />
                    </div>
                  ))}
                </div>
            }
          </Section>

          {/* Certifications */}
          <Section title="Сертификаты" icon="🏅">
            {meta.certifications.length === 0
              ? <p className="text-sm text-[#4b5563]">Сертификаты не требуются</p>
              : <div className="space-y-2">
                  {[...mandatoryCerts, ...recommendCerts, ...optionalCerts].map((cert, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-[#2d3148] last:border-0">
                      <div>
                        <div className="text-sm text-white">{cert.name}</div>
                        {cert.dataType === 'CODE' && <div className="text-[10px] text-[#4b5563] mt-0.5">Нужен код сертификата</div>}
                      </div>
                      <Badge req={cert.required} />
                    </div>
                  ))}
                </div>
            }
          </Section>

          {/* Notices */}
          <Section title="Обязательные поля описания (Notices)" icon="📋">
            {meta.noticeCategories.length === 0
              ? <p className="text-sm text-[#4b5563]">Специальных полей не требуется</p>
              : <div className="space-y-4">
                  {meta.noticeCategories.map((nc, i) => (
                    <div key={i}>
                      <div className="text-xs font-medium text-[#9ca3af] mb-2">{nc.noticeCategoryName}</div>
                      <div className="space-y-1.5 pl-3 border-l border-[#2d3148]">
                        {nc.noticeCategoryDetailNames.map((d, j) => (
                          <div key={j} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-white">{d.noticeCategoryDetailName}</span>
                            <Badge req={d.required} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
            }
          </Section>

          {/* Attributes */}
          <Section title="Атрибуты товара" icon="🏷️">
            {meta.attributes.length === 0
              ? <p className="text-sm text-[#4b5563]">Атрибуты не заданы</p>
              : <div className="space-y-2">
                  {mandatoryAttrs.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-[#6b7280] mb-2">Обязательные</div>
                      {mandatoryAttrs.map((attr, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-[#2d3148] last:border-0">
                          <div>
                            <span className="text-sm text-white">{attr.attributeTypeName}</span>
                            {attr.basicUnit && attr.basicUnit !== '없음' && <span className="text-xs text-[#4b5563] ml-2">({attr.basicUnit})</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#4b5563]">{attr.exposed === 'EXPOSED' ? 'Опция покупки' : 'Поиск'}</span>
                            <Badge req={attr.required} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {optionalAttrs.length > 0 && (
                    <div>
                      <div className="text-xs text-[#6b7280] mb-2">Необязательные</div>
                      {optionalAttrs.map((attr, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-[#2d3148] last:border-0">
                          <div>
                            <span className="text-sm text-[#9ca3af]">{attr.attributeTypeName}</span>
                            {attr.basicUnit && attr.basicUnit !== '없음' && <span className="text-xs text-[#4b5563] ml-2">({attr.basicUnit})</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#4b5563]">{attr.exposed === 'EXPOSED' ? 'Опция покупки' : 'Поиск'}</span>
                            <Badge req={attr.required} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            }
          </Section>

          {/* Other */}
          <Section title="Прочее" icon="⚙️">
            <div className="space-y-3">
              <div className="flex items-center justify-between py-1.5 border-b border-[#2d3148]">
                <span className="text-sm text-[#9ca3af]">Можно продавать один товар без опций</span>
                <span className={`text-sm font-medium ${meta.isAllowSingleItem ? 'text-green-400' : 'text-red-400'}`}>
                  {meta.isAllowSingleItem ? 'Да' : 'Нет'}
                </span>
              </div>
              <div className="py-1.5">
                <div className="text-sm text-[#9ca3af] mb-2">Допустимые состояния товара</div>
                <div className="flex flex-wrap gap-2">
                  {meta.allowedOfferConditions.map(cond => (
                    <span key={cond} className={`text-xs px-2.5 py-1 rounded-full border ${cond === 'NEW' ? 'text-green-400 border-green-400/30 bg-green-400/10' : 'text-[#9ca3af] border-[#2d3148] bg-[#12141f]'}`}>
                      {OFFER_CONDITION_LABELS[cond] ?? cond}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* Categories load error */}
      {catsError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 text-red-400 text-sm mb-4">
          Не удалось загрузить категории: {catsError}
        </div>
      )}

      {/* Empty state */}
      {!selected && !loadingMeta && (
        <div className="text-center py-20 text-[#4b5563]">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-sm">Введи название категории чтобы узнать требования Coupang</div>
          <div className="text-xs mt-1">Например: 화장품, 핸드폰케이스, 영양제, cosmetics, phone case...</div>
        </div>
      )}
    </div>
  )
}
