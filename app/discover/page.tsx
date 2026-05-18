'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Opportunity {
  id: number
  keyword: string
  volume: number
  competition: string
  verdict: string
  trendChange: number | null
  medianPrice: number | null
  topKeywords: string
}

interface HistoryItem {
  id: number
  keyword: string
  volume: number
  competition: string
  verdict: string
  verdictReason: string
  trendChange: number | null
  medianPrice: number | null
  minPrice: number | null
  maxPrice: number | null
  topKeywords: string
  competitors: string
  risks: string
  searchedAt: string
}

interface ResearchResult {
  keyword: string
  volume: number
  competition: string
  verdict: string
  verdictReason: string
  trendChange: number | null
  trendMonths: number[]
  medianPrice: number | null
  minPrice: number | null
  maxPrice: number | null
  topKeywords: Array<{ keyword: string; volume: number; competition: string }>
  competitors: Array<{ title: string; price: number; mall: string }>
  risks: string[]
  imageMatch?: { matches: boolean; explanation: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function compLabel(c: string) {
  if (c === '높음') return 'Высокая'
  if (c === '중간') return 'Средняя'
  if (c === '낮음') return 'Низкая'
  return c
}

function compColor(c: string) {
  if (c === '높음') return 'text-red-400'
  if (c === '중간') return 'text-yellow-400'
  return 'text-green-400'
}

function verdictBadge(v: string) {
  if (v === 'LAUNCH') return { label: '🟢 ЗАПУСКАТЬ', cls: 'bg-green-400/10 text-green-400 border-green-400/30' }
  if (v === 'TEST') return { label: '🟡 ТЕСТИРОВАТЬ', cls: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' }
  return { label: '🔴 ИЗБЕГАТЬ', cls: 'bg-red-400/10 text-red-400 border-red-400/30' }
}

function trendLabel(change: number | null) {
  if (change === null) return null
  if (change > 15) return { text: `📈 +${change}%`, cls: 'text-green-400' }
  if (change < -15) return { text: `📉 ${change}%`, cls: 'text-red-400' }
  return { text: `➡️ ${change > 0 ? '+' : ''}${change}%`, cls: 'text-[#9ca3af]' }
}

function Sparkline({ months }: { months: number[] }) {
  if (months.length < 2) return null
  const max = Math.max(...months, 1)
  const w = 80
  const h = 24
  const pts = months
    .map((v, i) => `${(i / (months.length - 1)) * w},${h - (v / max) * (h - 2) + 1}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [loadingOpps, setLoadingOpps] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const [keyword, setKeyword] = useState('')
  const [researching, setResearching] = useState(false)
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [researchError, setResearchError] = useState<string | null>(null)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [matchingImage, setMatchingImage] = useState(false)

  type RawSeries = { title: string; data: { period: string; ratio: number }[] }
  const [trendAvgNaver, setTrendAvgNaver] = useState<RawSeries | null>(null)
  const [trendAvgGoogle, setTrendAvgGoogle] = useState<RawSeries | null>(null)
  const [trendAvgLoading, setTrendAvgLoading] = useState(false)
  const [trendAvgDone, setTrendAvgDone] = useState(false)
  const [googleChartData, setGoogleChartData] = useState<{ period: string; ratio: number }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null)

  function loadHistory() {
    fetch('/api/discover/history')
      .then(r => r.json())
      .then(d => setHistory(d.history ?? []))
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => {
    fetch('/api/discover')
      .then(r => r.json())
      .then(data => {
        setOpportunities(data.results ?? [])
        setLastScan(data.lastScan ?? null)
      })
      .finally(() => setLoadingOpps(false))
    loadHistory()
  }, [])

  async function handleScan() {
    setScanning(true)
    setScanError(null)
    try {
      const res = await fetch('/api/discover/scan', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.ok) {
        const fresh = await fetch('/api/discover').then(r => r.json())
        setOpportunities(fresh.results ?? [])
        setLastScan(fresh.lastScan ?? null)
      }
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Ошибка при сканировании')
    } finally {
      setScanning(false)
    }
  }

  async function handleResearch() {
    if (!keyword.trim()) return
    setResearching(true)
    setResult(null)
    setResearchError(null)
    setTrendAvgNaver(null)
    setTrendAvgGoogle(null)
    setGoogleChartData([])
    setTrendAvgDone(false)
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim() }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)

      // fetch 12M trend averages in background
      const kw = keyword.trim()
      const end = new Date()
      const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      setTrendAvgLoading(true)
      Promise.all([
        fetch('/api/trends/keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), timeUnit: 'month', keyword: [{ name: kw, param: [kw] }] }),
        }).then(r => r.json()).then(d => (d.results?.[0] as RawSeries | undefined) ?? null).catch(() => null),
        fetch('/api/trends/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keywords: [kw], startDate: fmt(start), endDate: fmt(end) }),
        }).then(r => r.json()).then(d => (d.results?.[0] as RawSeries | undefined) ?? null).catch(() => null),
      ]).then(([naver, google]) => {
        setTrendAvgNaver(naver)
        setTrendAvgGoogle(google)
        setGoogleChartData(google?.data ?? [])
        setTrendAvgDone(true)
      }).finally(() => setTrendAvgLoading(false))

      loadHistory()

      if (imageFile) {
        setMatchingImage(true)
        const base64 = await fileToBase64(imageFile)
        const matchRes = await fetch('/api/discover/match-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: keyword.trim(), imageBase64: base64, imageMediaType: imageFile.type }),
        })
        const matchData = await matchRes.json()
        setResult(prev => prev ? { ...prev, imageMatch: matchData } : prev)
        setMatchingImage(false)
      }
    } catch (e) {
      setResearchError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setResearching(false)
    }
  }

  async function deleteHistory(id: number) {
    await fetch('/api/discover/history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setHistory(prev => prev.filter(h => h.id !== id))
    if (expandedHistory === id) setExpandedHistory(null)
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleFileChange = useCallback((file: File | null) => {
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }, [])

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Ниши</h1>
          <p className="text-xs text-[#6b7280] mt-0.5">
            {lastScan
              ? `Последний скан: ${new Date(lastScan).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'Скан ещё не запускался'}
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a1d2e] border border-[#2d3148] hover:border-[#6366f1] text-sm text-[#9ca3af] hover:text-white rounded-xl transition-colors disabled:opacity-50"
        >
          <span className={scanning ? 'animate-spin inline-block' : ''}>↻</span>
          {scanning ? 'Сканирование...' : 'Обновить сейчас'}
        </button>
      </div>

      {scanError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-3 text-red-400 text-sm mb-4">{scanError}</div>
      )}

      {/* Auto-discovered results */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Находки сегодня</h2>

        {loadingOpps ? (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-36 rounded-xl bg-[#1a1d2e] border border-[#2d3148] animate-pulse" />
            ))}
          </div>
        ) : opportunities.length === 0 ? (
          <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-10 text-center">
            <div className="text-3xl mb-3">🔍</div>
            <p className="text-sm text-[#6b7280] mb-4">Скан ещё не запускался сегодня. Нажми кнопку — займёт ~2 минуты.</p>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-5 py-2 bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white text-sm rounded-xl transition-colors"
            >
              {scanning ? 'Сканирование...' : 'Запустить первый скан'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {opportunities.map(opp => {
              const b = verdictBadge(opp.verdict)
              const trend = trendLabel(opp.trendChange)
              const topKws: Array<{ keyword: string; volume: number }> = JSON.parse(opp.topKeywords || '[]')
              return (
                <div key={opp.id} className="bg-[#1a1d2e] border border-[#2d3148] hover:border-[#374151] rounded-xl p-4 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-sm font-medium text-white">{opp.keyword}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${b.cls}`}>{b.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs mb-3">
                    <div><span className="text-[#4b5563]">Объём </span><span className="text-white">{opp.volume.toLocaleString('ru-RU')}/мес</span></div>
                    <div><span className="text-[#4b5563]">Конкур. </span><span className={compColor(opp.competition)}>{compLabel(opp.competition)}</span></div>
                    {trend && <div className={`text-xs ${trend.cls}`}>{trend.text}</div>}
                    {opp.medianPrice && <div><span className="text-[#4b5563]">Медиана </span><span className="text-white">{opp.medianPrice.toLocaleString('ru-RU')}₩</span></div>}
                  </div>
                  {topKws.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {topKws.map(k => (
                        <span key={k.keyword} className="text-[10px] px-1.5 py-0.5 bg-[#12141f] border border-[#2d3148] rounded text-[#6b7280]">{k.keyword}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Search history */}
      {(loadingHistory || history.length > 0) && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3">История поисков</h2>
          {loadingHistory ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-[#1a1d2e] border border-[#2d3148] animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(h => {
                const b = verdictBadge(h.verdict)
                const trend = trendLabel(h.trendChange)
                const isOpen = expandedHistory === h.id
                const topKws: Array<{ keyword: string; volume: number; competition: string }> = JSON.parse(h.topKeywords || '[]')
                const competitors: Array<{ title: string; price: number; mall: string }> = JSON.parse(h.competitors || '[]')
                const risks: string[] = JSON.parse(h.risks || '[]')
                return (
                  <div key={h.id} className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl overflow-hidden">
                    {/* Row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#12141f] transition-colors"
                      onClick={() => setExpandedHistory(isOpen ? null : h.id)}
                    >
                      <span className="text-sm font-medium text-white flex-1">{h.keyword}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${b.cls}`}>{b.label}</span>
                      <span className="text-xs text-[#4b5563]">{h.volume.toLocaleString('ru-RU')}/мес</span>
                      {trend && <span className={`text-xs ${trend.cls}`}>{trend.text}</span>}
                      <span className="text-[10px] text-[#4b5563]">
                        {new Date(h.searchedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteHistory(h.id) }}
                        className="text-[#4b5563] hover:text-red-400 transition-colors text-base leading-none ml-1"
                        title="Удалить"
                      >×</button>
                      <span className="text-[#4b5563] text-xs">{isOpen ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-[#2d3148] pt-3 space-y-3">
                        <p className="text-xs text-[#9ca3af]">{h.verdictReason}</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-[#12141f] rounded-lg p-2.5 text-center">
                            <div className="text-[10px] text-[#4b5563] mb-0.5">Конкуренция</div>
                            <div className={`text-sm font-medium ${compColor(h.competition)}`}>{compLabel(h.competition)}</div>
                          </div>
                          {h.medianPrice && (
                            <div className="bg-[#12141f] rounded-lg p-2.5 text-center">
                              <div className="text-[10px] text-[#4b5563] mb-0.5">Медиана цен</div>
                              <div className="text-sm font-medium">{h.medianPrice.toLocaleString('ru-RU')}₩</div>
                            </div>
                          )}
                          {h.minPrice && h.maxPrice && (
                            <div className="bg-[#12141f] rounded-lg p-2.5 text-center">
                              <div className="text-[10px] text-[#4b5563] mb-0.5">Разброс цен</div>
                              <div className="text-xs font-medium">{h.minPrice.toLocaleString('ru-RU')} – {h.maxPrice.toLocaleString('ru-RU')}₩</div>
                            </div>
                          )}
                        </div>
                        {risks.length > 0 && (
                          <div>
                            <div className="text-[10px] text-[#4b5563] uppercase tracking-wider mb-1.5">Риски</div>
                            <ul className="space-y-1">
                              {risks.map((r, i) => <li key={i} className="text-xs text-[#9ca3af] flex gap-1.5"><span className="text-yellow-400">⚠️</span>{r}</li>)}
                            </ul>
                          </div>
                        )}
                        {topKws.length > 0 && (
                          <div>
                            <div className="text-[10px] text-[#4b5563] uppercase tracking-wider mb-1.5">Ключи для листинга</div>
                            <div className="flex flex-wrap gap-1">
                              {topKws.slice(0, 15).map(k => (
                                <span key={k.keyword} className="text-[10px] px-1.5 py-0.5 bg-[#12141f] border border-[#2d3148] rounded text-[#6b7280]">{k.keyword}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {competitors.length > 0 && (
                          <div>
                            <div className="text-[10px] text-[#4b5563] uppercase tracking-wider mb-1.5">Конкуренты</div>
                            <div className="space-y-1">
                              {competitors.map((c, i) => (
                                <div key={i} className="flex justify-between gap-2 text-xs">
                                  <span className="text-[#6b7280] truncate">{c.title}</span>
                                  <span className="flex-shrink-0 text-[#9ca3af]">{c.price.toLocaleString('ru-RU')}₩</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Manual research */}
      <div>
        <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Проверить товар</h2>

        <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-5 mb-4">
          <div className="flex gap-3 mb-4">
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !researching && handleResearch()}
              placeholder="Ключевое слово по-корейски, например: 수납함"
              className="flex-1 bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#4b5563] outline-none transition-colors"
            />
            <button
              onClick={handleResearch}
              disabled={researching || !keyword.trim()}
              className="px-5 py-2.5 bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white text-sm rounded-xl transition-colors"
            >
              {researching ? 'Анализ...' : 'Исследовать'}
            </button>
          </div>

          {/* Image upload */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFileChange(f) }}
            onClick={() => fileRef.current?.click()}
            className="border border-dashed border-[#2d3148] hover:border-[#6366f1] rounded-xl p-4 cursor-pointer transition-colors flex items-center gap-4 min-h-[64px]"
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="preview" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                <div className="text-sm text-[#9ca3af] min-w-0">
                  <div className="text-white truncate">{imageFile?.name}</div>
                  <div className="text-xs text-[#4b5563]">Claude проверит соответствие ключевому слову</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null) }} className="ml-auto text-[#4b5563] hover:text-white text-xl leading-none">×</button>
              </>
            ) : (
              <div className="text-sm text-[#4b5563] text-center w-full">📷 Загрузи фото товара (опционально) — Claude проверит, соответствует ли он запросу</div>
            )}
          </div>
        </div>

        {researchError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-3 text-red-400 text-sm mb-4">{researchError}</div>
        )}

        {result && (
          <div className="space-y-4">

            {/* Verdict card */}
            <div className={`rounded-xl border p-5 ${
              result.verdict === 'LAUNCH' ? 'bg-green-400/5 border-green-400/20' :
              result.verdict === 'TEST' ? 'bg-yellow-400/5 border-yellow-400/20' :
              'bg-red-400/5 border-red-400/20'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className={`text-base font-bold mb-1 ${
                    result.verdict === 'LAUNCH' ? 'text-green-400' :
                    result.verdict === 'TEST' ? 'text-yellow-400' : 'text-red-400'
                  }`}>{verdictBadge(result.verdict).label}</div>
                  <p className="text-sm text-[#9ca3af]">{result.verdictReason}</p>
                </div>
                {result.trendMonths.length > 0 && (
                  <div className="flex-shrink-0 pt-1 text-right">
                    <Sparkline months={result.trendMonths} />
                    {result.trendChange !== null && (
                      <div className={`text-[10px] mt-1 ${trendLabel(result.trendChange)?.cls}`}>{trendLabel(result.trendChange)?.text}</div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-[#12141f] rounded-lg p-3 text-center">
                  <div className="text-[11px] text-[#4b5563] mb-1">Объём поиска</div>
                  <div className="text-sm font-medium">{result.volume.toLocaleString('ru-RU')}/мес</div>
                </div>
                <div className="bg-[#12141f] rounded-lg p-3 text-center">
                  <div className="text-[11px] text-[#4b5563] mb-1">Конкуренция</div>
                  <div className={`text-sm font-medium ${compColor(result.competition)}`}>{compLabel(result.competition)}</div>
                </div>
                <div className="bg-[#12141f] rounded-lg p-3 text-center">
                  <div className="text-[11px] text-[#4b5563] mb-1">Медиана цен</div>
                  <div className="text-sm font-medium">{result.medianPrice ? `${result.medianPrice.toLocaleString('ru-RU')}₩` : '—'}</div>
                </div>
              </div>
            </div>

            {/* Image match */}
            {(matchingImage || result.imageMatch) && (
              <div className={`rounded-xl border p-4 flex items-start gap-3 ${
                matchingImage ? 'bg-[#1a1d2e] border-[#2d3148]' :
                result.imageMatch?.matches ? 'bg-green-400/5 border-green-400/20' : 'bg-orange-400/5 border-orange-400/20'
              }`}>
                <span className="text-xl">{matchingImage ? '🔍' : result.imageMatch?.matches ? '✅' : '⚠️'}</span>
                <div>
                  <div className="text-sm font-medium mb-0.5">
                    {matchingImage ? 'Claude анализирует фото...' :
                      result.imageMatch?.matches ? 'Товар соответствует запросу' : 'Товар может не соответствовать'}
                  </div>
                  {result.imageMatch?.explanation && <p className="text-xs text-[#9ca3af]">{result.imageMatch.explanation}</p>}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Prices */}
              {(result.minPrice || result.maxPrice) && (
                <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
                  <h3 className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Цены конкурентов</h3>
                  <div className="space-y-2 text-sm mb-3">
                    <div className="flex justify-between"><span className="text-[#4b5563]">Мин</span><span>{result.minPrice?.toLocaleString('ru-RU')}₩</span></div>
                    <div className="flex justify-between"><span className="text-[#4b5563]">Медиана</span><span className="font-medium">{result.medianPrice?.toLocaleString('ru-RU')}₩</span></div>
                    <div className="flex justify-between"><span className="text-[#4b5563]">Макс</span><span>{result.maxPrice?.toLocaleString('ru-RU')}₩</span></div>
                  </div>
                  {result.competitors.length > 0 && (
                    <div className="pt-3 border-t border-[#2d3148] space-y-1.5">
                      {result.competitors.map((c, i) => (
                        <div key={i} className="flex justify-between gap-2 text-xs">
                          <span className="text-[#6b7280] truncate">{c.title}</span>
                          <span className="flex-shrink-0 text-[#9ca3af]">{c.price.toLocaleString('ru-RU')}₩</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Top keywords */}
              {result.topKeywords.length > 0 && (
                <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
                  <h3 className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Ключи для листинга</h3>
                  <div className="space-y-2">
                    {result.topKeywords.map((k, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-white">{k.keyword}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[#4b5563]">{k.volume.toLocaleString('ru-RU')}/мес</span>
                          <span className={`text-[10px] ${compColor(k.competition)}`}>{compLabel(k.competition)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Risks */}
            {result.risks.length > 0 && (
              <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
                <h3 className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Риски</h3>
                <ul className="space-y-1.5">
                  {result.risks.map((r, i) => (
                    <li key={i} className="text-sm text-[#9ca3af] flex gap-2"><span className="text-yellow-400 flex-shrink-0">⚠️</span>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Google Trends chart */}
            {(trendAvgLoading || trendAvgDone) && (
              <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Google Trends (Корея, 12 мес)</h3>
                </div>
                {trendAvgLoading && googleChartData.length === 0 ? (
                  <div className="h-[120px] flex items-center justify-center">
                    <div className="w-full space-y-2 px-2">
                      {[80, 60, 90].map((w, i) => <div key={i} className="h-3 rounded bg-[#2d3148] animate-pulse" style={{ width: `${w}%` }} />)}
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={googleChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} dy={4}
                        tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} width={24} />
                      <Tooltip
                        contentStyle={{ background: '#12141f', border: '1px solid #2d3148', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: '#e2e8f0' }}
                        formatter={(v: number) => [v, 'Индекс']}
                      />
                      <Line type="monotone" dataKey="ratio" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            {/* Trend averages */}
            {(trendAvgLoading || trendAvgDone) && (() => {
              const STAT_PERIODS = [
                { label: '1 мес', months: 1 },
                { label: '3 мес', months: 3 },
                { label: '6 мес', months: 6 },
                { label: '9 мес', months: 9 },
                { label: '1 год', months: 12 },
              ]
              function calcAvgs(series: RawSeries | null) {
                if (!series) return STAT_PERIODS.map(p => ({ label: p.label, avg: null as number | null }))
                const now = new Date()
                return STAT_PERIODS.map(({ label, months }) => {
                  const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1).toISOString().slice(0, 7)
                  const vals = series.data.filter(p => p.period >= cutoff).map(p => p.ratio).filter(v => v > 0)
                  return { label, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null }
                })
              }
              return (
                <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
                  <h3 className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Средний индекс поиска</h3>
                  {trendAvgLoading ? (
                    <div className="space-y-2">
                      <div className="h-8 rounded bg-[#2d3148] animate-pulse" />
                      <div className="h-8 rounded bg-[#2d3148] animate-pulse" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[{ label: 'Naver', avgs: calcAvgs(trendAvgNaver) }, { label: 'Google', avgs: calcAvgs(trendAvgGoogle) }].map(({ label, avgs }) => (
                        <div key={label} className="grid grid-cols-[56px_1fr] gap-2 items-center">
                          <span className="text-[10px] text-[#4b5563]">{label}</span>
                          <div className="flex gap-2">
                            {avgs.map(({ label: l, avg }) => (
                              <div key={l} className="flex-1 bg-[#12141f] rounded-lg px-2 py-1.5 text-center">
                                <div className="text-[10px] text-[#4b5563] mb-0.5">{l}</div>
                                <div className="text-sm font-semibold text-[#e2e8f0]">{avg ?? '—'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
