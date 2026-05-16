'use client'
import { useEffect, useState, KeyboardEvent } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

interface DbProduct {
  id: string
  name: string
  imageUrl: string | null
  naverCategoryId: string | null
}

interface TrendPoint {
  period: string
  [keyword: string]: number | string
}

interface KeywordVolume {
  keyword: string
  monthlyPcQcCnt: number | '< 10'
  monthlyMobileQcCnt: number | '< 10'
  monthlyTotalQcCnt: number | '< 10'
}


const DATALAB_CATEGORIES = [
  { id: '50000000', label: '전체 (Все)' },
  { id: '50000001', label: '패션의류 (Одежда)' },
  { id: '50000002', label: '패션잡화 (Аксессуары)' },
  { id: '50000003', label: '화장품/미용 (Косметика)' },
  { id: '50000004', label: '디지털/가전 (Электроника)' },
  { id: '50000005', label: '가구/인테리어 (Мебель)' },
  { id: '50000006', label: '출산/육아 (Детские товары)' },
  { id: '50000007', label: '식품 (Продукты)' },
  { id: '50000008', label: '스포츠/레저 (Спорт)' },
  { id: '50000009', label: '생활/건강 (Быт/Здоровье)' },
  { id: '50000010', label: '여행/문화 (Путешествия)' },
  { id: '50000011', label: '면세점 (Дьюти-фри)' },
]

const PERIODS = [
  { label: '30д',  days: 30,  timeUnit: 'week'  as const },
  { label: '90д',  days: 90,  timeUnit: 'week'  as const },
  { label: '180д', days: 180, timeUnit: 'week'  as const },
  { label: '365д', days: 365, timeUnit: 'month' as const },
]

const LINE_COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e']
const MAX_KEYWORDS = 5

function getPeriodDates(days: number) {
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
}

function buildChartData(
  results: Array<{ title: string; data: Array<{ period: string; ratio: number }> }>,
): TrendPoint[] {
  const map = new Map<string, TrendPoint>()
  for (const result of results) {
    for (const point of result.data) {
      if (!map.has(point.period)) map.set(point.period, { period: point.period.slice(5) })
      map.get(point.period)![result.title] = point.ratio
    }
  }
  return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period))
}

export default function TrendsPage() {
  const [products, setProducts] = useState<DbProduct[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState(DATALAB_CATEGORIES[1].id)
  const [period, setPeriod] = useState(PERIODS[1])
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)
  const [volumes, setVolumes] = useState<KeywordVolume[]>([])
  const [volumeLoading, setVolumeLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [loadingTags, setLoadingTags] = useState<Record<string, boolean>>({})
  const [missingCreds, setMissingCreds] = useState(false)

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(setProducts)
  }, [])

  useEffect(() => {
    if (keywords.length === 0) {
      setTrendData([])
      return
    }
    const { startDate, endDate } = getPeriodDates(period.days)
    setTrendLoading(true)
    setTrendError(null)
    setRateLimited(false)

    const category = categoryId

    fetch('/api/trends/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: period.timeUnit,
        category,
        keyword: keywords.map(k => ({ name: k, param: [k] })),
      }),
    })
      .then(r => {
        if (r.status === 503) { setMissingCreds(true); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        if (data.rateLimited) setRateLimited(true)
        if (data.results) setTrendData(buildChartData(data.results))
        else if (data.error) setTrendError(data.error)
      })
      .catch(() => setTrendError('Ошибка сети'))
      .finally(() => setTrendLoading(false))
  }, [keywords, period, categoryId])

  useEffect(() => {
    if (keywords.length === 0) { setVolumes([]); return }
    setVolumeLoading(true)
    fetch('/api/trends/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords }),
    })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setVolumes(data) })
      .catch(() => {})
      .finally(() => setVolumeLoading(false))
  }, [keywords])

  async function handleAddProduct(product: DbProduct) {
    if (loadingTags[product.id]) return
    setLoadingTags(prev => ({ ...prev, [product.id]: true }))
    try {
      const res = await fetch(`/api/products/${product.id}`)
      const data = await res.json()
      const tags: string[] = data.searchTags ?? []
      const toAdd = tags.filter(t => !keywords.includes(t))
      const newKeywords = [...keywords, ...toAdd].slice(0, MAX_KEYWORDS)
      setKeywords(newKeywords)
    } finally {
      setLoadingTags(prev => ({ ...prev, [product.id]: false }))
    }
  }

  function addKeyword(kw: string) {
    const trimmed = kw.trim()
    if (!trimmed || keywords.includes(trimmed) || keywords.length >= MAX_KEYWORDS) return
    setKeywords(prev => [...prev, trimmed])
  }

  function removeKeyword(kw: string) {
    setKeywords(prev => prev.filter(k => k !== kw))
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      addKeyword(inputValue)
      setInputValue('')
    }
  }

  return (
    <div>
      {missingCreds && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          Добавь <code className="font-mono bg-red-500/10 px-1 rounded">NAVER_CLIENT_ID</code> и{' '}
          <code className="font-mono bg-red-500/10 px-1 rounded">NAVER_CLIENT_SECRET</code> в{' '}
          <code className="font-mono bg-red-500/10 px-1 rounded">.env.local</code>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Тренды Naver Shopping</h1>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="bg-[#1a1d2e] border border-[#2d3148] text-[#9ca3af] text-xs rounded-lg px-2 py-1.5 outline-none focus:border-[#6366f1] transition-colors"
          >
            {DATALAB_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button
              key={p.label}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md border text-xs transition-colors ${
                period.label === p.label
                  ? 'bg-[#1e2a4a] text-blue-400 border-blue-400'
                  : 'bg-[#1a1d2e] text-[#9ca3af] border-[#2d3148] hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product list + keyword pills */}
      <div className="grid grid-cols-[220px_1fr] gap-4 mb-4">
        <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] p-4">
          <p className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Товары</p>
          <div className="flex flex-col gap-2">
            {products.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                  )}
                  <span className="text-xs text-[#e2e8f0] truncate">{p.name}</span>
                </div>
                <button
                  onClick={() => handleAddProduct(p)}
                  disabled={!p.naverCategoryId || loadingTags[p.id] || keywords.length >= MAX_KEYWORDS}
                  title={!p.naverCategoryId ? 'Укажи Naver-категорию в настройках товара' : undefined}
                  className="flex-shrink-0 w-6 h-6 rounded-md bg-[#6366f1]/20 hover:bg-[#6366f1]/40 disabled:opacity-30 disabled:cursor-not-allowed text-blue-400 text-sm font-bold transition-colors"
                >
                  {loadingTags[p.id] ? '…' : '+'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] p-4">
          <p className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">
            Ключевые слова <span className="text-[#4b5563]">({keywords.length}/{MAX_KEYWORDS})</span>
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            {keywords.map((kw, i) => (
              <span
                key={kw}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border"
                style={{ borderColor: LINE_COLORS[i % LINE_COLORS.length] + '60', color: LINE_COLORS[i % LINE_COLORS.length], background: LINE_COLORS[i % LINE_COLORS.length] + '15' }}
              >
                {kw}
                <button onClick={() => removeKeyword(kw)} className="opacity-60 hover:opacity-100 text-[10px] leading-none">×</button>
              </span>
            ))}
            {keywords.length < MAX_KEYWORDS && (
              <input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="+ добавить слово, Enter"
                className="bg-transparent border border-dashed border-[#2d3148] focus:border-[#6366f1] rounded-full px-3 py-1 text-xs text-[#9ca3af] placeholder-[#4b5563] outline-none transition-colors min-w-[180px]"
              />
            )}
          </div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-semibold">Динамика кликов (индекс 0–100)</p>
          {rateLimited && (
            <span className="text-[11px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
              Rate limit — показаны кэшированные данные
            </span>
          )}
        </div>

        {trendLoading ? (
          <div className="h-[280px] flex items-center justify-center">
            <div className="flex flex-col gap-2 w-full px-4">
              {[100, 70, 90, 50, 80].map((w, i) => (
                <div key={i} className="h-4 rounded bg-[#2d3148] animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        ) : trendError ? (
          <div className="h-[280px] flex items-center justify-center text-[#6b7280] text-sm">{trendError}</div>
        ) : keywords.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-[#4b5563] text-sm">
            Выбери товар или добавь ключевые слова
          </div>
        ) : trendData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-[#6b7280] text-sm">
            Нет данных за выбранный период
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={6} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{ background: '#12141f', border: '1px solid #2d3148', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: '#e2e8f0', marginBottom: 4 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: 8 }} />
              {keywords.map((kw, i) => (
                <Line
                  key={kw}
                  type="monotone"
                  dataKey={kw}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Search volume table */}
      {keywords.length > 0 && (
        <div className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] p-5">
          <p className="text-[13px] font-semibold mb-4">Объём поиска (в месяц)</p>
          {volumeLoading ? (
            <div className="flex flex-col gap-2">
              {keywords.map((_, i) => <div key={i} className="h-8 rounded bg-[#2d3148] animate-pulse" />)}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-[#6b7280] uppercase tracking-wider">
                  <th className="text-left pb-2">Слово</th>
                  <th className="text-right pb-2 w-28">PC</th>
                  <th className="text-right pb-2 w-28">Мобайл</th>
                  <th className="text-right pb-2 w-28">Итого</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw, i) => {
                  const v = volumes.find(v => v.keyword === kw)
                  const fmt = (n: number | '< 10' | undefined) =>
                    n === undefined ? '—' : n === '< 10' ? '< 10' : n.toLocaleString('ru-RU')
                  return (
                    <tr key={kw} className="border-t border-[#2d3148]">
                      <td className="py-2">
                        <span className="inline-block w-2 h-2 rounded-full mr-2 flex-shrink-0"
                          style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
                        {kw}
                      </td>
                      <td className="py-2 text-right text-[#9ca3af]">{fmt(v?.monthlyPcQcCnt)}</td>
                      <td className="py-2 text-right text-[#9ca3af]">{fmt(v?.monthlyMobileQcCnt)}</td>
                      <td className="py-2 text-right font-medium">{fmt(v?.monthlyTotalQcCnt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
