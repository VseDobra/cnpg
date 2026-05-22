'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'

interface Niche {
  id: string
  keyword: string
  scrapedAt: string
  verdictLevel: string
}
interface Group {
  canonical: string
  variants: string[]
  totalCount: number
  niches: { runId: string; keyword: string; count: number }[]
}
interface HeatmapData {
  groups: Group[]
  allNiches: Niche[]
  totals: { rawTopics: number; totalNiches: number }
}

type Kind = 'pain' | 'positive' | 'fear'

export default function HeatmapPage() {
  const [kind, setKind] = useState<Kind>('pain')
  const [minNiches, setMinNiches] = useState(2)
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    fetch(`/api/explorer/heatmap?kind=${kind}&minNiches=${minNiches}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: HeatmapData) => { setData(d); setError(null) })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [kind, minNiches])

  const toggle = (canonical: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(canonical)) next.delete(canonical)
      else next.add(canonical)
      return next
    })
  }

  // Колонки таблицы = ниши, отсортированы по дате (свежее справа)
  const nichesInColumns = data
    ? [...data.allNiches].sort((a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime())
    : []

  const accentLabel = kind === 'pain' ? 'Боли' : kind === 'positive' ? 'Похвалы' : 'Страхи (Q&A)'
  const accentText = kind === 'pain' ? 'text-red-300' : kind === 'positive' ? 'text-emerald-300' : 'text-amber-300'

  // Максимум count по всем ячейкам — для нормировки цвета
  const maxCellCount = data
    ? Math.max(1, ...data.groups.flatMap((g) => g.niches.map((n) => n.count)))
    : 1

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/40 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center gap-4 flex-wrap">
          <Link href="/explorer" className="text-cyan-400 hover:text-cyan-300 text-sm">← Все прогоны</Link>
          <span className="text-slate-600">•</span>
          <h1 className="text-xl font-bold">🔥 Heatmap болей по нишам</h1>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              {(['pain', 'positive', 'fear'] as Kind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`text-xs px-3 py-1.5 rounded transition-colors ${
                    kind === k ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {k === 'pain' ? 'Боли' : k === 'positive' ? 'Похвалы' : 'Страхи Q&A'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Мин. ниш:
              <input
                type="number"
                min={1}
                max={20}
                value={minNiches}
                onChange={(e) => setMinNiches(Math.max(1, Number(e.target.value) || 1))}
                className="w-14 bg-slate-800 rounded px-2 py-1 text-sm text-slate-100"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <p className="text-sm text-slate-400 mb-4">
          <strong className={accentText}>{accentLabel}</strong>, повторяющиеся в <strong>{minNiches}+</strong> ниш —
          это сигналы рынка, а не специфика одной категории. Хорошее место для нового продукта, который их закрывает.
        </p>
        <p className="text-[11px] text-slate-500 mb-6">
          Группировка делается по пересечению токенов (Jaccard ≥ 0.5) — близкие формулировки сворачиваются в одну. Клик
          по строке раскрывает варианты, клик по ячейке открывает прогон. Цвет ячейки = интенсивность относительно
          максимума.
        </p>

        {loading && <div className="text-slate-500 py-8 text-center">Загрузка…</div>}
        {error && <div className="text-red-400 py-8 text-center">Ошибка: {error}</div>}
        {data && !loading && (
          <>
            <div className="text-xs text-slate-500 mb-3">
              Сгруппировано <strong className="text-slate-300">{data.groups.length}</strong> тем из{' '}
              <strong className="text-slate-300">{data.totals.rawTopics}</strong> сырых, по{' '}
              <strong className="text-slate-300">{data.totals.totalNiches}</strong> нишам.
            </div>

            {data.groups.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
                Нет тем, повторяющихся в {minNiches}+ нишах. Снизь порог или сделай больше прогонов.
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-auto">
                <table className="text-sm">
                  <thead className="bg-slate-800/60 text-[10px] uppercase text-slate-400">
                    <tr>
                      <th className="text-left px-3 py-3 sticky left-0 bg-slate-800/95 z-10 min-w-[260px] max-w-[360px]">
                        Тема (канонич.)
                      </th>
                      <th className="text-center px-2 py-3 sticky left-[260px] bg-slate-800/95 z-10" title="В скольких нишах встречается">
                        ниш
                      </th>
                      <th className="text-center px-2 py-3 sticky left-[300px] bg-slate-800/95 z-10" title="Суммарное число упоминаний">
                        Σ
                      </th>
                      {nichesInColumns.map((n) => (
                        <th
                          key={n.id}
                          className="px-2 py-3 text-left align-bottom min-w-[36px] max-w-[36px]"
                          title={n.keyword}
                        >
                          <div className="origin-bottom-left -rotate-45 translate-y-1 whitespace-nowrap text-[10px] text-slate-300 font-normal">
                            {n.keyword.length > 18 ? n.keyword.slice(0, 16) + '…' : n.keyword}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.map((g) => {
                      const isOpen = expanded.has(g.canonical)
                      const nicheById = new Map(g.niches.map((n) => [n.runId, n]))
                      return (
                        <Fragment key={g.canonical}>
                          <tr
                            className="border-t border-slate-800 hover:bg-slate-800/30 cursor-pointer"
                            onClick={() => toggle(g.canonical)}
                          >
                            <td className="px-3 py-2 sticky left-0 bg-slate-900 z-10 max-w-[360px]">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 text-xs">{isOpen ? '▼' : '▶'}</span>
                                <span className="text-slate-100 text-xs leading-tight">{g.canonical}</span>
                                {g.variants.length > 1 && (
                                  <span className="text-[10px] text-slate-500 ml-auto shrink-0">
                                    +{g.variants.length - 1}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center text-cyan-300 font-semibold tabular-nums sticky left-[260px] bg-slate-900 z-10">
                              {g.niches.length}
                            </td>
                            <td className="px-2 py-2 text-center text-slate-300 tabular-nums sticky left-[300px] bg-slate-900 z-10">
                              {g.totalCount}
                            </td>
                            {nichesInColumns.map((col) => {
                              const cell = nicheById.get(col.id)
                              if (!cell) return <td key={col.id} className="px-2 py-2" />
                              const intensity = cell.count / maxCellCount // 0..1
                              const alpha = 0.15 + intensity * 0.75
                              const color = kind === 'positive'
                                ? `rgba(16, 185, 129, ${alpha.toFixed(2)})`
                                : kind === 'fear'
                                ? `rgba(245, 158, 11, ${alpha.toFixed(2)})`
                                : `rgba(239, 68, 68, ${alpha.toFixed(2)})`
                              return (
                                <td key={col.id} className="px-1 py-1">
                                  <Link
                                    href={`/explorer/${col.id}`}
                                    className="block w-full h-7 rounded text-[10px] text-slate-50 font-semibold tabular-nums flex items-center justify-center hover:ring-2 hover:ring-slate-200/60 transition-all"
                                    style={{ background: color }}
                                    title={`${col.keyword} — ${cell.count} упоминаний (открыть прогон)`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {cell.count}
                                  </Link>
                                </td>
                              )
                            })}
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-950/40">
                              <td colSpan={3 + nichesInColumns.length} className="px-3 py-2 sticky left-0">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                                  Все варианты формулировок
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {g.variants.map((v) => (
                                    <span
                                      key={v}
                                      className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
                                    >
                                      {v}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
