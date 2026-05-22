'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Topic { id: string; kind: string; topic: string; count: number }
interface Product {
  productId: string
  name: string
  price: number
  rating: number
  reviewCount: number
  firstImage: string
  url: string
  isRocket: boolean
}
interface RunDetail {
  id: string
  keyword: string
  scrapedAt: string
  verdictLevel: string
  verdictText: string
  metrics: Record<string, number | string>
  reasons: string[]
  reviewCount: number
  productCount: number
  products: Product[]
  topics: Topic[]
}

const QUERY_KEYS = ['a', 'b', 'c', 'd'] as const

export default function ComparePage() {
  const [runs, setRuns] = useState<RunDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ids = QUERY_KEYS.map((k) => params.get(k)).filter((x): x is string => !!x)
    if (ids.length < 2) {
      setError('Нужно передать минимум ?a=ID&b=ID (до 4 прогонов).')
      setLoading(false)
      return
    }
    Promise.all(
      ids.map((id) =>
        fetch(`/api/explorer/runs/${id}`).then((r) =>
          r.ok ? r.json() : Promise.reject(`${id}: ${r.status}`),
        ),
      ),
    )
      .then((rs) => setRuns(rs))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Shell>Загрузка...</Shell>
  if (error) return <Shell><span className="text-red-400">{error}</span></Shell>
  if (runs.length < 2) return <Shell>Нет данных</Shell>

  const colsClass =
    runs.length === 2 ? 'grid-cols-2' : runs.length === 3 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/40 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/explorer" className="text-cyan-400 hover:text-cyan-300 text-sm">← Все прогоны</Link>
          <span className="text-slate-600">•</span>
          <h1 className="text-xl font-bold">Сравнение прогонов <span className="text-slate-500 text-sm font-normal">({runs.length})</span></h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
        <HeadersRow runs={runs} cols={colsClass} />
        <VerdictRow runs={runs} cols={colsClass} />
        <MetricsRow runs={runs} />
        <PriceRow runs={runs} cols={colsClass} />
        <TopicsRow runs={runs} cols={colsClass} kind="pain" title="Боль клиентов" accent="red" />
        <TopicsRow runs={runs} cols={colsClass} kind="positive" title="Что хвалят" accent="green" />
        <TopProductsRow runs={runs} cols={colsClass} />
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-950 text-slate-300 p-8">{children}</div>
}

function HeadersRow({ runs, cols }: { runs: RunDetail[]; cols: string }) {
  return (
    <div className={`grid gap-4 ${cols}`}>
      {runs.map((r) => (
        <div key={r.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-baseline gap-2 mb-1">
            <h2 className="text-base font-bold text-slate-100 truncate flex-1">{r.keyword || '—'}</h2>
            <Link href={`/explorer/${r.id}`} className="text-[10px] text-cyan-400 hover:text-cyan-300 shrink-0">
              открыть →
            </Link>
          </div>
          <div className="text-[11px] text-slate-500">{new Date(r.scrapedAt).toLocaleString('ru-RU')}</div>
          <div className="flex gap-3 mt-2 text-[11px] text-slate-400">
            <span>Л: <strong className="text-slate-100">{r.productCount}</strong></span>
            <span>О: <strong className="text-slate-100">{r.reviewCount}</strong></span>
          </div>
        </div>
      ))}
    </div>
  )
}

function VerdictRow({ runs, cols }: { runs: RunDetail[]; cols: string }) {
  const color = (lvl: string) =>
    lvl === 'GO' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
    : lvl === 'MAYBE' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
    : 'bg-red-500/15 text-red-300 border-red-500/40'
  return (
    <Section title="Вердикт">
      <div className={`grid gap-4 ${cols}`}>
        {runs.map((r) => (
          <div key={r.id}>
            <span className={`inline-block px-3 py-1 rounded-full border text-xs font-semibold mb-3 ${color(r.verdictLevel)}`}>
              {r.verdictText}
            </span>
            <ul className="text-xs text-slate-300 space-y-1">
              {r.reasons.map((reason, i) => <li key={i}>· {reason}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}

const METRIC_LABELS: Record<string, string> = {
  products: 'Листингов',
  medianPrice: 'Медиана цены',
  avgPrice: 'Средняя цена',
  avgRating: 'Средний ★',
  medianReviewCount: 'Медиана отзывов',
  totalReviews: 'Всего отзывов',
  topThreeShare: 'Топ-3 концентрация',
  negativeShare: '% негатива',
  rocketShare: '% Rocket',
}

// Метрики где «меньше = лучше»
const LOWER_IS_BETTER = new Set(['negativeShare', 'medianPrice', 'avgPrice', 'topThreeShare'])

function MetricsRow({ runs }: { runs: RunDetail[] }) {
  const keys = Array.from(new Set(runs.flatMap((r) => Object.keys(r.metrics))))
  return (
    <Section title="Метрики">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
            <tr>
              <th className="text-left px-4 py-2.5 sticky left-0 bg-slate-800/80">Метрика</th>
              {runs.map((r) => (
                <th key={r.id} className="text-right px-4 py-2.5 truncate max-w-[140px]" title={r.keyword}>
                  {r.keyword}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const values = runs.map((r) => Number(r.metrics[k]))
              const allNumeric = values.every((v) => Number.isFinite(v))
              const best = allNumeric ? (LOWER_IS_BETTER.has(k) ? Math.min(...values) : Math.max(...values)) : null
              const worst = allNumeric ? (LOWER_IS_BETTER.has(k) ? Math.max(...values) : Math.min(...values)) : null
              return (
                <tr key={k} className="border-t border-slate-800">
                  <td className="px-4 py-2 text-slate-400 text-xs sticky left-0 bg-slate-900/95">{METRIC_LABELS[k] ?? k}</td>
                  {runs.map((r, idx) => {
                    const v = r.metrics[k]
                    const n = values[idx]
                    const isBest = allNumeric && best !== worst && n === best
                    const isWorst = allNumeric && best !== worst && n === worst
                    return (
                      <td
                        key={r.id}
                        className={`px-4 py-2 text-right tabular-nums ${
                          isBest ? 'text-emerald-300 font-semibold' : isWorst ? 'text-red-300' : 'text-slate-100'
                        }`}
                      >
                        {fmt(v)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function fmt(v: number | string | undefined): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  if (Math.abs(n) >= 10000) return Math.round(n).toLocaleString()
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(2)
}

function PriceRow({ runs, cols }: { runs: RunDetail[]; cols: string }) {
  const stats = (r: RunDetail) => {
    const prices = r.products.map((p) => p.price).filter((p) => p > 0).sort((x, y) => x - y)
    if (!prices.length) return { min: 0, p33: 0, median: 0, p66: 0, max: 0, count: 0 }
    const q = (p: number) => prices[Math.floor(prices.length * p)] ?? 0
    return {
      min: prices[0],
      p33: q(0.33),
      median: prices[Math.floor(prices.length / 2)],
      p66: q(0.66),
      max: prices[prices.length - 1],
      count: prices.length,
    }
  }
  const allStats = runs.map((r) => ({ r, s: stats(r) }))
  const globalMax = Math.max(...allStats.map((x) => x.s.max), 1)
  const seg = (x: number) => `${(x / globalMax) * 100}%`
  return (
    <Section title="Ценовые диапазоны">
      <div className={`grid gap-4 ${cols}`}>
        {allStats.map(({ r, s }) => (
          <div key={r.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <div className="text-xs text-slate-400 mb-3 truncate">{r.keyword} <span className="text-slate-600">({s.count})</span></div>
            <div className="relative h-5 bg-slate-800 rounded mb-2">
              <div className="absolute h-full bg-cyan-500/40 rounded" style={{ left: seg(s.min), width: seg(s.max - s.min) }} />
              <div className="absolute h-full w-0.5 bg-cyan-300" style={{ left: seg(s.median) }} title={`медиана ${s.median.toLocaleString()}₩`} />
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-500 tabular-nums">
              <div>min<br/><span className="text-slate-300">{s.min.toLocaleString()}</span></div>
              <div className="text-cyan-300 text-center">med<br/><span>{s.median.toLocaleString()}</span></div>
              <div className="text-right">max<br/><span className="text-slate-300">{s.max.toLocaleString()}</span></div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function TopicsRow({ runs, cols, kind, title, accent }: { runs: RunDetail[]; cols: string; kind: string; title: string; accent: 'red' | 'green' }) {
  const perRun = useMemo(
    () => runs.map((r) => r.topics.filter((t) => t.kind === kind)),
    [runs, kind],
  )
  const norm = (s: string) => s.toLowerCase().trim()
  // overlap = тема встречается у ≥2 прогонов
  const counter = new Map<string, number>()
  for (const list of perRun) {
    const seen = new Set<string>()
    for (const t of list) {
      const n = norm(t.topic)
      if (seen.has(n)) continue
      seen.add(n)
      counter.set(n, (counter.get(n) ?? 0) + 1)
    }
  }
  const overlapCount = [...counter.values()].filter((c) => c >= 2).length
  const accentText = accent === 'red' ? 'text-red-400' : 'text-emerald-400'
  const chipBase =
    accent === 'red'
      ? 'bg-red-500/10 text-red-200 border-red-500/30'
      : 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30'
  const chipOverlap =
    accent === 'red'
      ? 'bg-amber-500/20 text-amber-100 border-amber-400/50'
      : 'bg-cyan-500/20 text-cyan-100 border-cyan-400/50'

  return (
    <Section title={title}>
      <div className="text-xs text-slate-500 mb-3">
        Общих тем (в 2+ прогонах): <strong className={accentText}>{overlapCount}</strong>
        {overlapCount > 0 && ' — отмечены ⚡'}
      </div>
      <div className={`grid gap-4 ${cols}`}>
        {runs.map((r, i) => {
          const topics = perRun[i]
          return (
            <div key={r.id}>
              <div className="text-xs text-slate-400 mb-2 truncate">{r.keyword}</div>
              {topics.length === 0 ? (
                <div className="text-xs text-slate-500">— нет</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t) => {
                    const overlap = (counter.get(norm(t.topic)) ?? 0) >= 2
                    return (
                      <span
                        key={t.id}
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${overlap ? chipOverlap : chipBase}`}
                        title={overlap ? `Встречается в ${counter.get(norm(t.topic))} прогонах` : ''}
                      >
                        <span className="opacity-70 mr-1">×{t.count}</span>
                        {t.topic}
                        {overlap && <span className="ml-0.5">⚡</span>}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function TopProductsRow({ runs, cols }: { runs: RunDetail[]; cols: string }) {
  const top = (r: RunDetail) =>
    [...r.products].sort((x, y) => y.reviewCount - x.reviewCount).slice(0, 5)
  return (
    <Section title="Топ-5 конкурентов">
      <div className={`grid gap-4 ${cols}`}>
        {runs.map((r) => (
          <div key={r.id} className="space-y-2">
            <div className="text-xs text-slate-400 mb-2 truncate">{r.keyword}</div>
            {top(r).map((p) => (
              <a
                key={p.productId}
                href={p.url}
                target="_blank"
                rel="noopener"
                className="flex gap-2 bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-lg p-2 transition-colors"
              >
                {p.firstImage ? (
                  <img src={p.firstImage} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-slate-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-slate-200 leading-tight line-clamp-2">{p.name}</div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 tabular-nums">
                    <span className="font-semibold text-slate-100">{p.price.toLocaleString()}₩</span>
                    <span>★{p.rating.toFixed(1)}</span>
                    <span>{p.reviewCount.toLocaleString()}</span>
                    {p.isRocket && <span className="text-cyan-400">R</span>}
                  </div>
                </div>
              </a>
            ))}
          </div>
        ))}
      </div>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      {children}
    </section>
  )
}
