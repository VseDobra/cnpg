'use client'
import { useState, useCallback } from 'react'
import type { SaleRecord } from '@/lib/coupang/sales'
import type { SettlementHistory } from '@/lib/coupang/settlements'
import DateRangePicker from '@/components/DateRangePicker'

type Tab = 'sales' | 'settlements'

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d
}

function defaultDates() {
  const end = yesterday()
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  return { start: toInputDate(start), end: toInputDate(end) }
}

function fmt(n: number) {
  return '₩' + n.toLocaleString('ru-RU')
}

// ── Sales tab ────────────────────────────────────────────────────────────────

function SalesTab() {
  const def = defaultDates()
  const [startDate, setStartDate] = useState(def.start)
  const [endDate, setEndDate] = useState(def.end)
  const [records, setRecords] = useState<SaleRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [nextToken, setNextToken] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [searched, setSearched] = useState(false)

  const load = useCallback(async (token = '') => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ recognitionDateFrom: startDate, recognitionDateTo: endDate, token, maxPerPage: '50' })
      const res = await fetch(`/api/sales?${params}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (token) {
        setRecords(prev => [...prev, ...(data.data ?? [])])
      } else {
        setRecords(data.data ?? [])
        setSearched(true)
      }
      setHasNext(data.hasNext ?? false)
      setNextToken(data.nextToken ?? '')
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [startDate, endDate])

  const sales = records.filter(r => r.saleType === 'SALE')
  const refunds = records.filter(r => r.saleType === 'REFUND')

  const totalSaleAmount = sales.reduce((s, r) => s + r.items.reduce((a, i) => a + i.saleAmount, 0), 0)
  const totalRefundAmount = refunds.reduce((s, r) => s + r.items.reduce((a, i) => a + i.saleAmount, 0), 0)
  const totalFee = records.reduce((s, r) => s + r.items.reduce((a, i) => a + i.serviceFee + i.serviceFeeVat, 0), 0)
  const totalSettlement = records.reduce((s, r) => s + r.items.reduce((a, i) => a + i.settlementAmount, 0), 0)

  return (
    <div>
      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3 items-center">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          maxDays={31}
          onChange={(s, e) => { setStartDate(s); setEndDate(e) }}
        />
        <button onClick={() => load('')} disabled={loading}
          className="bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm transition-colors">
          {loading ? 'Загрузка...' : 'Найти'}
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}

      {/* KPI */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-4">
          {[
            { label: 'Продажи', value: fmt(totalSaleAmount), color: 'text-white' },
            { label: 'Возвраты', value: fmt(totalRefundAmount), color: 'text-red-400' },
            { label: 'Комиссия', value: fmt(totalFee), color: 'text-orange-400' },
            { label: 'К выплате', value: fmt(totalSettlement), color: 'text-green-400' },
          ].map(k => (
            <div key={k.label} className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
              <p className="text-[11px] text-[#6b7280] mb-1">{k.label}</p>
              <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {records.length === 0 && !loading && !error && !searched && (
        <div className="text-center py-20 text-[#4b5563]">
          <div className="text-4xl mb-3">💰</div>
          <div className="text-sm">Нажми «Найти» чтобы загрузить историю продаж</div>
          <div className="text-xs mt-1 text-[#374151]">Диапазон до 31 дня, только до вчерашнего дня</div>
        </div>
      )}
      {records.length === 0 && !loading && !error && searched && (
        <div className="text-center py-20 text-[#4b5563]">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-sm">Нет данных за выбранный период</div>
          <div className="text-xs mt-1 text-[#374151]">Дата признания — это дата подтверждения покупки или доставка +7 дней</div>
        </div>
      )}

      {records.length > 0 && (
        <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl overflow-hidden">
          <div className="text-xs text-[#6b7280] px-4 py-2.5 border-b border-[#2d3148]">
            {records.length} записей · {sales.length} продаж · {refunds.length} возвратов
          </div>
          <div className="divide-y divide-[#2d3148]">
            {records.map((r, idx) => {
              const isExpanded = expanded === idx
              const totalItem = r.items.reduce((a, i) => a + i.settlementAmount, 0)
              const isRefund = r.saleType === 'REFUND'
              return (
                <div key={idx}>
                  <button
                    className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#1e2237] transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : idx)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${isRefund ? 'text-red-400 border-red-400/30 bg-red-400/10' : 'text-green-400 border-green-400/30 bg-green-400/10'}`}>
                        {isRefund ? 'Возврат' : 'Продажа'}
                      </span>
                      <span className="text-xs text-[#6b7280] shrink-0">{r.recognitionDate}</span>
                      <span className="text-xs text-[#4b5563] truncate">Заказ #{r.orderId || '—'}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className={`text-sm font-medium ${isRefund ? 'text-red-400' : 'text-white'}`}>{fmt(totalItem)}</span>
                      <span className="text-[#4b5563] text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-[#12141f]">
                      <div className="text-[11px] text-[#6b7280] mb-2 pt-2">
                        Дата продажи: {r.saleDate} · Признание: {r.recognitionDate} · Расчёт: {r.settlementDate}
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr>
                            {['Товар', 'Кол-во', 'Сумма', 'Комиссия', 'НДС', 'К выплате'].map(h => (
                              <th key={h} className="text-[10px] text-[#4b5563] uppercase text-left px-2 py-1.5 border-b border-[#2d3148]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {r.items.map((item, i) => (
                            <tr key={i} className="border-b border-[#1e2233] last:border-0">
                              <td className="px-2 py-2 text-xs text-white max-w-[200px] truncate">{item.productName || '—'}</td>
                              <td className="px-2 py-2 text-xs text-[#9ca3af]">{item.quantity}</td>
                              <td className="px-2 py-2 text-xs">{fmt(item.saleAmount)}</td>
                              <td className="px-2 py-2 text-xs text-orange-400">-{fmt(item.serviceFee)}</td>
                              <td className="px-2 py-2 text-xs text-orange-300">-{fmt(item.serviceFeeVat)}</td>
                              <td className="px-2 py-2 text-xs text-green-400 font-medium">{fmt(item.settlementAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {r.deliveryFee.amount > 0 && (
                        <div className="mt-2 text-xs text-[#6b7280]">
                          Доставка: {fmt(r.deliveryFee.amount)} · К выплате за доставку: {fmt(r.deliveryFee.settlementAmount)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {hasNext && (
            <div className="px-4 py-3 border-t border-[#2d3148]">
              <button onClick={() => load(nextToken)} disabled={loading}
                className="w-full text-sm text-[#6b7280] hover:text-white transition-colors disabled:opacity-50">
                {loading ? 'Загрузка...' : 'Загрузить ещё →'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Settlements tab ──────────────────────────────────────────────────────────

const SETTLEMENT_TYPE_LABELS: Record<string, string> = {
  MONTHLY: 'Ежемесячный',
  WEEKLY: 'Еженедельный',
  ADDITIONAL: 'Дополнительный',
  RESERVE: 'Финальный резерв',
  DAILY: 'Ежедневный',
}

function toYearMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function SettlementsTab() {
  const now = new Date()
  const [month, setMonth] = useState(toYearMonth(new Date(now.getFullYear(), now.getMonth() - 1)))
  const [records, setRecords] = useState<SettlementHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/settlement-histories?month=${month}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRecords(Array.isArray(data) ? data : [])
      setSearched(true)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  const totalFinal = records.reduce((s, r) => s + r.finalAmount, 0)
  const totalSale = records.reduce((s, r) => s + r.totalSale, 0)
  const totalFee = records.reduce((s, r) => s + r.serviceFee, 0)
  const done = records.filter(r => r.status === 'DONE').length
  const pending = records.filter(r => r.status === 'SUBJECT').length

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] rounded-xl px-4 py-2.5 transition-colors">
          <span>📅</span>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-transparent text-sm text-white outline-none"
          />
        </div>
        <button onClick={load} disabled={loading}
          className="bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm transition-colors">
          {loading ? 'Загрузка...' : 'Найти'}
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}

      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-4">
          {[
            { label: 'Продажи', value: fmt(totalSale), color: 'text-white' },
            { label: 'Комиссия', value: fmt(totalFee), color: 'text-orange-400' },
            { label: 'Итого выплачено', value: fmt(totalFinal), color: 'text-green-400' },
            { label: 'Статус', value: `${done} выплачено · ${pending} ожидает`, color: 'text-[#9ca3af]' },
          ].map(k => (
            <div key={k.label} className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4">
              <p className="text-[11px] text-[#6b7280] mb-1">{k.label}</p>
              <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {records.length === 0 && !loading && !error && !searched && (
        <div className="text-center py-20 text-[#4b5563]">
          <div className="text-4xl mb-3">💳</div>
          <div className="text-sm">Выбери месяц и нажми «Найти»</div>
        </div>
      )}
      {records.length === 0 && !loading && !error && searched && (
        <div className="text-center py-20 text-[#4b5563]">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-sm">Нет данных за {month}</div>
        </div>
      )}

      {records.length > 0 && (
        <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                {['Тип', 'Период', 'Дата расчёта', 'Продажи', 'Комиссия', 'К выплате', 'Статус'].map(h => (
                  <th key={h} className="text-[10px] text-[#6b7280] uppercase text-left px-4 py-3 border-b border-[#2d3148]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} className="border-b border-[#1e2233] last:border-0 hover:bg-[#1e2237] transition-colors">
                  <td className="px-4 py-3 text-xs text-white">{SETTLEMENT_TYPE_LABELS[r.settlementType] ?? r.settlementType}</td>
                  <td className="px-4 py-3 text-xs text-[#6b7280]">{r.revenueRecognitionDateFrom} — {r.revenueRecognitionDateTo}</td>
                  <td className="px-4 py-3 text-xs text-[#6b7280]">{r.settlementDate}</td>
                  <td className="px-4 py-3 text-xs">{fmt(r.totalSale)}</td>
                  <td className="px-4 py-3 text-xs text-orange-400">-{fmt(r.serviceFee)}</td>
                  <td className="px-4 py-3 text-xs text-green-400 font-medium">{fmt(r.finalAmount)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${r.status === 'DONE' ? 'text-green-400 border-green-400/30 bg-green-400/10' : 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'}`}>
                      {r.status === 'DONE' ? 'Выплачено' : 'Ожидает'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {records[0]?.bankAccount && (
            <div className="px-4 py-3 border-t border-[#2d3148] text-xs text-[#4b5563]">
              Банк: {records[0].bankName} · Счёт: {records[0].bankAccount} · {records[0].bankAccountHolder}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('sales')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold mb-1">Финансы</h1>
        <p className="text-sm text-[#6b7280]">История продаж и расчёты</p>
      </div>

      <div className="flex gap-1 mb-5 bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-1">
        <button onClick={() => setTab('sales')} className={`flex-1 py-2 rounded-lg text-sm transition-colors ${tab === 'sales' ? 'bg-[#6366f1] text-white' : 'text-[#6b7280] hover:text-white'}`}>
          📈 История продаж
        </button>
        <button onClick={() => setTab('settlements')} className={`flex-1 py-2 rounded-lg text-sm transition-colors ${tab === 'settlements' ? 'bg-[#6366f1] text-white' : 'text-[#6b7280] hover:text-white'}`}>
          💳 Расчёты
        </button>
      </div>

      {tab === 'sales' ? <SalesTab /> : <SettlementsTab />}
    </div>
  )
}
