'use client'
import { useState, useRef, useEffect } from 'react'

interface Props {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  maxDays?: number
  maxDate?: string
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function MonthGrid({
  year, month, start, end, hover, maxDate, onDayClick, onDayHover,
}: {
  year: number; month: number
  start: Date | null; end: Date | null; hover: Date | null
  maxDate: Date
  onDayClick: (d: Date) => void
  onDayHover: (d: Date) => void
}) {
  const firstDay = new Date(year, month, 1)
  // week starts Monday: shift so Mon=0
  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(startOffset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const rangeEnd = end ?? hover

  return (
    <div>
      <div className="text-sm font-medium text-white text-center mb-3">
        {MONTHS_RU[month]} {year}
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_RU.map(d => (
          <div key={d} className="text-[10px] text-[#4b5563] text-center py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const isDisabled = day > maxDate
          const isStart = start && isSameDay(day, start)
          const isEnd = end && isSameDay(day, end)
          const inRange = start && rangeEnd && day > start && day < rangeEnd
          const isHover = hover && !end && isSameDay(day, hover)
          const isToday = isSameDay(day, new Date())

          let bg = ''
          if (isStart || isEnd) bg = 'bg-[#6366f1] text-white rounded-full'
          else if (inRange) bg = 'bg-[#6366f1]/20 text-white rounded-none'
          else if (isHover) bg = 'bg-[#6366f1]/30 text-white rounded-full'
          else bg = 'text-[#9ca3af] hover:bg-[#2d3148] rounded-full'

          return (
            <div key={i} className="flex items-center justify-center py-0.5">
              <button
                disabled={isDisabled}
                onClick={() => !isDisabled && onDayClick(day)}
                onMouseEnter={() => !isDisabled && onDayHover(day)}
                className={`w-8 h-8 text-xs transition-colors ${bg} ${isDisabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'} ${isToday && !isStart && !isEnd ? 'ring-1 ring-[#6366f1] rounded-full' : ''}`}
              >
                {day.getDate()}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DateRangePicker({ startDate, endDate, onChange, maxDays = 31, maxDate }: Props) {
  const maxD = maxDate ? parseDate(maxDate) : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d })()

  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const d = parseDate(endDate)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selecting, setSelecting] = useState<Date | null>(null)
  const [hover, setHover] = useState<Date | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSelecting(null); setHover(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const start = parseDate(startDate)
  const end = parseDate(endDate)

  function handleDayClick(day: Date) {
    if (!selecting) {
      setSelecting(day)
    } else {
      let s = selecting, e = day
      if (day < selecting) { s = day; e = selecting }
      // enforce maxDays
      const diff = Math.round((e.getTime() - s.getTime()) / 86400000)
      if (diff >= maxDays) {
        e = new Date(s.getTime() + (maxDays - 1) * 86400000)
        if (e > maxD) e = maxD
      }
      onChange(toInputDate(s), toInputDate(e))
      setSelecting(null)
      setHover(null)
      setOpen(false)
    }
  }

  const prevMonth = addMonths(viewDate, -1)

  function formatRange() {
    const fmt = (d: Date) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
    return `${fmt(start)} — ${fmt(end)}`
  }

  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setSelecting(null); setHover(null) }}
        className="flex items-center gap-2 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] rounded-xl px-4 py-2.5 text-sm text-white transition-colors"
      >
        <span>📅</span>
        <span>{formatRange()}</span>
        <span className="text-[10px] text-[#4b5563] ml-1">{diffDays} дн.</span>
        <span className="text-[#4b5563] ml-1">▼</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-2 left-0 bg-[#1a1d2e] border border-[#2d3148] rounded-2xl shadow-2xl p-5">
          {selecting && (
            <div className="text-[11px] text-[#6366f1] text-center mb-3">
              Выбери конечную дату (макс. {maxDays} дней)
            </div>
          )}
          <div className="flex gap-8">
            <MonthGrid
              year={prevMonth.getFullYear()} month={prevMonth.getMonth()}
              start={selecting ?? start} end={selecting ? null : end}
              hover={hover} maxDate={maxD}
              onDayClick={handleDayClick} onDayHover={setHover}
            />
            <div className="w-px bg-[#2d3148]" />
            <MonthGrid
              year={viewDate.getFullYear()} month={viewDate.getMonth()}
              start={selecting ?? start} end={selecting ? null : end}
              hover={hover} maxDate={maxD}
              onDayClick={handleDayClick} onDayHover={setHover}
            />
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#2d3148]">
            <button onClick={() => setViewDate(addMonths(viewDate, -1))} className="text-[#6b7280] hover:text-white px-3 py-1 rounded-lg text-sm transition-colors">← Назад</button>
            {!selecting && (
              <div className="text-[11px] text-[#4b5563]">{formatRange()} · {diffDays} дн.</div>
            )}
            <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="text-[#6b7280] hover:text-white px-3 py-1 rounded-lg text-sm transition-colors">Вперёд →</button>
          </div>
        </div>
      )}
    </div>
  )
}
