'use client'
import { useState, useCallback } from 'react'
import type { Inquiry, InquiryPagination, CallCenterInquiry, CallCenterReply } from '@/lib/coupang/inquiries'

type Tab = 'direct' | 'callcenter'
type DirectFilter = 'ALL' | 'ANSWERED' | 'NOANSWER'
type CCFilter = 'NONE' | 'NO_ANSWER' | 'ANSWER' | 'TRANSFER'

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 6)
  return { start: toInputDate(start), end: toInputDate(end) }
}

// ── Direct inquiries tab ─────────────────────────────────────────────────────

function DirectTab() {
  const def = defaultDates()
  const [startDate, setStartDate] = useState(def.start)
  const [endDate, setEndDate] = useState(def.end)
  const [filter, setFilter] = useState<DirectFilter>('ALL')
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [pagination, setPagination] = useState<InquiryPagination | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [replyText, setReplyText] = useState<Record<number, string>>({})
  const [replying, setReplying] = useState<number | null>(null)
  const [replyError, setReplyError] = useState<Record<number, string>>({})
  const [replyDone, setReplyDone] = useState<Set<number>>(new Set())

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ inquiryStartAt: startDate, inquiryEndAt: endDate, answeredType: filter, pageNum: String(page), pageSize: '50' })
      const res = await fetch(`/api/inquiries?${params}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setInquiries(data.content ?? [])
      setPagination(data.pagination ?? null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [startDate, endDate, filter])

  async function sendReply(inquiryId: number) {
    const text = replyText[inquiryId]?.trim()
    if (!text) return
    setReplying(inquiryId); setReplyError(prev => ({ ...prev, [inquiryId]: '' }))
    try {
      const res = await fetch(`/api/inquiries/${inquiryId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setReplyDone(prev => new Set([...prev, inquiryId]))
      setReplyText(prev => ({ ...prev, [inquiryId]: '' }))
      load()
    } catch (e) { setReplyError(prev => ({ ...prev, [inquiryId]: String(e) })) }
    finally { setReplying(null) }
  }

  const filterLabels: Record<DirectFilter, string> = { ALL: 'Все', ANSWERED: 'Отвечено', NOANSWER: 'Без ответа' }
  const filterColors: Record<DirectFilter, string> = {
    ALL: 'border-[#6366f1] text-[#818cf8] bg-[#6366f1]/10',
    ANSWERED: 'border-green-500 text-green-400 bg-green-500/10',
    NOANSWER: 'border-orange-400 text-orange-400 bg-orange-400/10',
  }

  return (
    <div>
      <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#6b7280]">Начало</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-[#12141f] border border-[#2d3148] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#6366f1]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#6b7280]">Конец</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-[#12141f] border border-[#2d3148] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#6366f1]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#6b7280]">Статус</label>
          <div className="flex gap-1.5">
            {(['ALL', 'NOANSWER', 'ANSWERED'] as DirectFilter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 rounded-lg text-xs border transition-colors ${filter === f ? filterColors[f] : 'border-[#2d3148] text-[#6b7280] hover:text-white hover:border-[#4b5563]'}`}>{filterLabels[f]}</button>
            ))}
          </div>
        </div>
        <button onClick={() => load(1)} disabled={loading} className="ml-auto bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors">
          {loading ? 'Загрузка...' : 'Найти'}
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}
      {pagination && <div className="text-xs text-[#6b7280] mb-3">Найдено: {pagination.totalElements} вопросов · Страница {pagination.currentPage} из {pagination.totalPages}</div>}

      {inquiries.length === 0 && !loading && !error && (
        <div className="text-center py-20 text-[#4b5563]">
          <div className="text-4xl mb-3">💬</div>
          <div className="text-sm">Нажми «Найти» чтобы загрузить вопросы</div>
        </div>
      )}

      <div className="space-y-3">
        {inquiries.map(inq => {
          const isExpanded = expanded === inq.inquiryId
          const answered = inq.commentDtoList.length > 0
          const done = replyDone.has(inq.inquiryId)
          return (
            <div key={inq.inquiryId} className={`bg-[#1a1d2e] border rounded-xl overflow-hidden ${answered ? 'border-[#2d3148]' : 'border-orange-400/30'}`}>
              <button className="w-full text-left px-5 py-4 flex items-start justify-between gap-3 hover:bg-[#1e2237] transition-colors" onClick={() => setExpanded(isExpanded ? null : inq.inquiryId)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${answered ? 'text-green-400 border-green-400/30 bg-green-400/10' : 'text-orange-400 border-orange-400/30 bg-orange-400/10'}`}>{answered ? 'Отвечено' : 'Без ответа'}</span>
                    <span className="text-[10px] text-[#4b5563]">#{inq.inquiryId}</span>
                    {inq.orderIds?.length > 0 && <span className="text-[10px] text-blue-400">Заказ #{inq.orderIds[0]}</span>}
                    <span className="text-[10px] text-[#4b5563]">{formatDate(inq.inquiryAt)}</span>
                  </div>
                  <p className="text-sm text-white leading-relaxed line-clamp-2">{inq.content}</p>
                  <p className="text-[11px] text-[#4b5563] mt-1">Товар ID: {inq.sellerProductId}</p>
                </div>
                <span className="text-[#4b5563] text-lg mt-0.5 shrink-0">{isExpanded ? '▲' : '▼'}</span>
              </button>
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-[#2d3148] pt-4 space-y-4">
                  <div>
                    <div className="text-[11px] text-[#6b7280] mb-1.5">Вопрос покупателя</div>
                    <div className="bg-[#12141f] rounded-lg px-4 py-3 text-sm text-white leading-relaxed whitespace-pre-wrap">{inq.content}</div>
                  </div>
                  {inq.commentDtoList.length > 0 && (
                    <div>
                      <div className="text-[11px] text-[#6b7280] mb-1.5">Ответы продавца</div>
                      <div className="space-y-2">
                        {inq.commentDtoList.map(c => (
                          <div key={c.inquiryCommentId} className="bg-green-400/5 border border-green-400/20 rounded-lg px-4 py-3">
                            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{c.content}</p>
                            <p className="text-[10px] text-[#4b5563] mt-1.5">{formatDate(c.inquiryCommentAt)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!answered || done) && (
                    <div>
                      <div className="text-[11px] text-[#6b7280] mb-1.5">{done ? 'Ответ отправлен' : 'Написать ответ'}</div>
                      {done ? (
                        <div className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-4 py-2.5">Ответ успешно отправлен</div>
                      ) : (
                        <div className="space-y-2">
                          <textarea rows={4} value={replyText[inq.inquiryId] ?? ''} onChange={e => setReplyText(prev => ({ ...prev, [inq.inquiryId]: e.target.value }))} placeholder="Напишите ответ покупателю..." className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none resize-none transition-colors" />
                          {replyError[inq.inquiryId] && <p className="text-xs text-red-400">{replyError[inq.inquiryId]}</p>}
                          <button onClick={() => sendReply(inq.inquiryId)} disabled={replying === inq.inquiryId || !replyText[inq.inquiryId]?.trim()} className="bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                            {replying === inq.inquiryId ? 'Отправка...' : 'Отправить ответ'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex gap-2 justify-center mt-6">
          {Array.from({ length: Math.min(pagination.totalPages, 10) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => load(p)} className={`w-8 h-8 rounded-lg text-xs transition-colors ${p === pagination.currentPage ? 'bg-[#6366f1] text-white' : 'bg-[#1a1d2e] border border-[#2d3148] text-[#6b7280] hover:text-white'}`}>{p}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Call Center tab ──────────────────────────────────────────────────────────

const CC_STATUS_LABELS: Record<CCFilter, string> = { NONE: 'Все', NO_ANSWER: 'Без ответа', ANSWER: 'Отвечено', TRANSFER: 'Ожидает подтверждения' }
const CC_STATUS_COLORS: Record<string, string> = {
  NONE: 'border-[#6366f1] text-[#818cf8] bg-[#6366f1]/10',
  NO_ANSWER: 'border-orange-400 text-orange-400 bg-orange-400/10',
  ANSWER: 'border-green-500 text-green-400 bg-green-500/10',
  TRANSFER: 'border-yellow-400 text-yellow-400 bg-yellow-400/10',
}

function CCReplyBadge({ reply }: { reply: CallCenterReply }) {
  const isVendor = reply.answerType === 'vendor'
  return (
    <div className={`border rounded-lg px-4 py-3 ${isVendor ? 'bg-green-400/5 border-green-400/20' : 'bg-[#12141f] border-[#2d3148]'}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isVendor ? 'text-green-400 border-green-400/30' : 'text-[#6b7280] border-[#2d3148]'}`}>{isVendor ? 'Продавец' : 'Оператор Coupang'}</span>
        <span className="text-[10px] text-[#4b5563]">{formatDate(reply.replyAt)}</span>
      </div>
      <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{reply.content}</p>
    </div>
  )
}

function CallCenterTab() {
  const def = defaultDates()
  const [startDate, setStartDate] = useState(def.start)
  const [endDate, setEndDate] = useState(def.end)
  const [filter, setFilter] = useState<CCFilter>('NONE')
  const [inquiries, setInquiries] = useState<CallCenterInquiry[]>([])
  const [pagination, setPagination] = useState<InquiryPagination | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [replyText, setReplyText] = useState<Record<number, string>>({})
  const [replying, setReplying] = useState<number | null>(null)
  const [replyError, setReplyError] = useState<Record<number, string>>({})
  const [replyDone, setReplyDone] = useState<Set<number>>(new Set())

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ inquiryStartAt: startDate, inquiryEndAt: endDate, partnerCounselingStatus: filter, pageNum: String(page), pageSize: '30' })
      const res = await fetch(`/api/call-center-inquiries?${params}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setInquiries(data.content ?? [])
      setPagination(data.pagination ?? null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [startDate, endDate, filter])

  async function sendReply(inq: CallCenterInquiry) {
    const text = replyText[inq.inquiryId]?.trim()
    if (!text) return
    // parentAnswerId — последний answerId из replies (от csAgent или любой)
    const lastReply = [...inq.replies].reverse().find(r => r.answerId)
    if (!lastReply) {
      setReplyError(prev => ({ ...prev, [inq.inquiryId]: 'Не найден parentAnswerId — невозможно ответить' }))
      return
    }
    setReplying(inq.inquiryId); setReplyError(prev => ({ ...prev, [inq.inquiryId]: '' }))
    try {
      const res = await fetch(`/api/call-center-inquiries/${inq.inquiryId}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, parentAnswerId: lastReply.answerId })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setReplyDone(prev => new Set([...prev, inq.inquiryId]))
      setReplyText(prev => ({ ...prev, [inq.inquiryId]: '' }))
      load()
    } catch (e) { setReplyError(prev => ({ ...prev, [inq.inquiryId]: String(e) })) }
    finally { setReplying(null) }
  }

  return (
    <div>
      <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#6b7280]">Начало</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-[#12141f] border border-[#2d3148] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#6366f1]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#6b7280]">Конец</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-[#12141f] border border-[#2d3148] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#6366f1]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#6b7280]">Статус</label>
          <div className="flex gap-1.5 flex-wrap">
            {(['NONE', 'NO_ANSWER', 'ANSWER', 'TRANSFER'] as CCFilter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 rounded-lg text-xs border transition-colors ${filter === f ? CC_STATUS_COLORS[f] : 'border-[#2d3148] text-[#6b7280] hover:text-white hover:border-[#4b5563]'}`}>{CC_STATUS_LABELS[f]}</button>
            ))}
          </div>
        </div>
        <button onClick={() => load(1)} disabled={loading} className="ml-auto bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors">
          {loading ? 'Загрузка...' : 'Найти'}
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}
      {pagination && <div className="text-xs text-[#6b7280] mb-3">Найдено: {pagination.totalElements} обращений · Страница {pagination.currentPage} из {pagination.totalPages}</div>}

      {inquiries.length === 0 && !loading && !error && (
        <div className="text-center py-20 text-[#4b5563]">
          <div className="text-4xl mb-3">📞</div>
          <div className="text-sm">Нажми «Найти» чтобы загрузить обращения</div>
        </div>
      )}

      <div className="space-y-3">
        {inquiries.map(inq => {
          const isExpanded = expanded === inq.inquiryId
          const needsAnswer = inq.replies.some(r => r.needAnswer)
          const done = replyDone.has(inq.inquiryId)

          return (
            <div key={inq.inquiryId} className={`bg-[#1a1d2e] border rounded-xl overflow-hidden ${needsAnswer ? 'border-orange-400/30' : 'border-[#2d3148]'}`}>
              <button className="w-full text-left px-5 py-4 flex items-start justify-between gap-3 hover:bg-[#1e2237] transition-colors" onClick={() => setExpanded(isExpanded ? null : inq.inquiryId)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${needsAnswer ? 'text-orange-400 border-orange-400/30 bg-orange-400/10' : 'text-green-400 border-green-400/30 bg-green-400/10'}`}>{needsAnswer ? 'Нужен ответ' : 'Отвечено'}</span>
                    <span className="text-[10px] text-[#4b5563]">#{inq.inquiryId}</span>
                    {inq.orderId && <span className="text-[10px] text-blue-400">Заказ #{inq.orderId}</span>}
                    <span className="text-[10px] text-[#4b5563]">{formatDate(inq.inquiryAt)}</span>
                  </div>
                  <p className="text-sm text-white leading-relaxed line-clamp-1">{inq.itemName || inq.content}</p>
                  {inq.receiptCategory && <p className="text-[11px] text-[#4b5563] mt-0.5">{inq.receiptCategory}</p>}
                </div>
                <span className="text-[#4b5563] text-lg mt-0.5 shrink-0">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-[#2d3148] pt-4 space-y-4">
                  <div>
                    <div className="text-[11px] text-[#6b7280] mb-1.5">Суть обращения</div>
                    <div className="bg-[#12141f] rounded-lg px-4 py-3 text-sm text-white leading-relaxed whitespace-pre-wrap">{inq.content}</div>
                  </div>
                  {inq.replies.length > 0 && (
                    <div>
                      <div className="text-[11px] text-[#6b7280] mb-1.5">История переписки</div>
                      <div className="space-y-2">
                        {inq.replies.map(r => <CCReplyBadge key={r.answerId} reply={r} />)}
                      </div>
                    </div>
                  )}
                  {(needsAnswer || done) && (
                    <div>
                      <div className="text-[11px] text-[#6b7280] mb-1.5">{done ? 'Ответ отправлен' : 'Ответить'}</div>
                      {done ? (
                        <div className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-4 py-2.5">Ответ успешно отправлен</div>
                      ) : (
                        <div className="space-y-2">
                          <textarea rows={4} value={replyText[inq.inquiryId] ?? ''} onChange={e => setReplyText(prev => ({ ...prev, [inq.inquiryId]: e.target.value }))} placeholder="Напишите ответ (2–1000 символов)..." className="w-full bg-[#12141f] border border-[#2d3148] focus:border-[#6366f1] rounded-lg px-3 py-2.5 text-sm text-white outline-none resize-none transition-colors" />
                          {replyError[inq.inquiryId] && <p className="text-xs text-red-400">{replyError[inq.inquiryId]}</p>}
                          <button onClick={() => sendReply(inq)} disabled={replying === inq.inquiryId || !replyText[inq.inquiryId]?.trim()} className="bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                            {replying === inq.inquiryId ? 'Отправка...' : 'Отправить ответ'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex gap-2 justify-center mt-6">
          {Array.from({ length: Math.min(pagination.totalPages, 10) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => load(p)} className={`w-8 h-8 rounded-lg text-xs transition-colors ${p === pagination.currentPage ? 'bg-[#6366f1] text-white' : 'bg-[#1a1d2e] border border-[#2d3148] text-[#6b7280] hover:text-white'}`}>{p}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InquiriesPage() {
  const [tab, setTab] = useState<Tab>('direct')

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold mb-1">Вопросы покупателей</h1>
        <p className="text-sm text-[#6b7280]">Прямые вопросы и обращения через контакт-центр Coupang</p>
      </div>

      <div className="flex gap-1 mb-5 bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-1">
        <button onClick={() => setTab('direct')} className={`flex-1 py-2 rounded-lg text-sm transition-colors ${tab === 'direct' ? 'bg-[#6366f1] text-white' : 'text-[#6b7280] hover:text-white'}`}>
          💬 Прямые вопросы
        </button>
        <button onClick={() => setTab('callcenter')} className={`flex-1 py-2 rounded-lg text-sm transition-colors ${tab === 'callcenter' ? 'bg-[#6366f1] text-white' : 'text-[#6b7280] hover:text-white'}`}>
          📞 Контакт-центр
        </button>
      </div>

      {tab === 'direct' ? <DirectTab /> : <CallCenterTab />}
    </div>
  )
}
