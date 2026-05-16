'use client'
import { useEffect, useState } from 'react'
import { clearCategoryCache, getCacheMeta } from '@/lib/categoryCache'

interface SyncLog {
  id: string
  type: string
  status: string
  message: string | null
  syncedAt: string
}

export default function SettingsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [syncing, setSyncing] = useState(false)

  const loadLogs = () =>
    fetch('/api/sync-logs').then(r => r.json()).then(setLogs)

  useEffect(() => { loadLogs() }, [])

  const [autoGenLoading, setAutoGenLoading] = useState(false)
  const [autoGenMsg, setAutoGenMsg] = useState('')

  const handleAutoGenAll = async () => {
    setAutoGenLoading(true)
    setAutoGenMsg('')
    try {
      const res = await fetch('/api/products/auto-generated', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAutoGenMsg('✓ Автогенерация опций включена для всех товаров')
    } catch (e) {
      setAutoGenMsg(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setAutoGenLoading(false)
    }
  }

  const [catCleared, setCatCleared] = useState(false)
  const [catMeta, setCatMeta] = useState<{ savedAt: number; expiresAt: number } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)


  useEffect(() => { setCatMeta(getCacheMeta()) }, [])

  const handleClearCatCache = () => {
    clearCategoryCache()
    setCatMeta(null)
    setShowConfirm(false)
    setCatCleared(true)
    setTimeout(() => setCatCleared(false), 2000)
  }

  const fmt = (ts: number) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

  const handleSync = async () => {
    setSyncing(true)
    await fetch('/api/sync', { method: 'POST' })
    await loadLogs()
    setSyncing(false)
  }

  return (
    <div>
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-[#2d3148] rounded-2xl p-6 w-80 shadow-2xl">
            <div className="text-2xl mb-3 text-center">🗑</div>
            <h3 className="text-sm font-semibold text-white text-center mb-2">Обновить кэш категорий?</h3>
            <p className="text-xs text-[#6b7280] text-center mb-5">Текущий кэш будет удалён. При следующем открытии страницы Категорий загрузится свежий список с Coupang.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 bg-[#12141f] border border-[#2d3148] hover:border-[#6366f1] text-[#9ca3af] hover:text-white text-sm rounded-lg transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleClearCatCache}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Да, обновить
              </button>
            </div>
          </div>
        </div>
      )}
      <h1 className="text-lg font-semibold mb-6">Настройки</h1>
      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148] mb-4">
        <p className="text-sm font-semibold mb-1">Автогенерация опций — все товары</p>
        <p className="text-xs text-[#6b7280] mb-4">Включает автоматическое создание вариантов «купить 2 шт», «купить 3 шт» для всех подходящих товаров аккаунта.</p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAutoGenAll}
            disabled={autoGenLoading}
            className="px-4 py-2 bg-[#6366f1] hover:bg-[#5457e0] disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {autoGenLoading ? '...' : '📦 Включить для всех товаров'}
          </button>
          {autoGenMsg && (
            <span className={`text-xs ${autoGenMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{autoGenMsg}</span>
          )}
        </div>
      </div>

      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148] mb-4">
        <p className="text-sm font-semibold mb-3">Кэш категорий</p>
        <p className="text-xs text-[#6b7280] mb-4">18 000+ категорий Coupang кэшируются на 30 дней и обновляются автоматически.</p>
        {catMeta ? (
          <div className="text-xs text-[#6b7280] mb-4 space-y-1">
            <div>Загружены: <span className="text-[#9ca3af]">{fmt(catMeta.savedAt)}</span></div>
            <div>Следующее обновление: <span className="text-green-400">{fmt(catMeta.expiresAt)}</span></div>
          </div>
        ) : (
          <div className="text-xs text-[#4b5563] mb-4">Кэш пуст — загрузится при следующем открытии страницы Категорий</div>
        )}
        <button
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 bg-[#12141f] hover:bg-[#1e2233] border border-[#2d3148] hover:border-[#6366f1] text-[#9ca3af] hover:text-white text-sm rounded-lg transition-colors"
        >
          {catCleared ? '✅ Кэш сброшен — обновится при следующем открытии' : '🗑 Обновить категории сейчас'}
        </button>
      </div>
<div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148] mb-4">
        <p className="text-sm font-semibold mb-3">Синхронизация</p>
        <p className="text-xs text-[#6b7280] mb-4">Данные синхронизируются автоматически каждый час. Нажмите кнопку для ручного запуска.</p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-[#2d3148] disabled:text-[#6b7280] text-white text-sm rounded-lg transition-colors"
        >
          {syncing ? '⏳ Синхронизация...' : '🔄 Синхронизировать сейчас'}
        </button>
      </div>
      <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
        <p className="text-sm font-semibold mb-3">Журнал синхронизации</p>
        {logs.map(log => (
          <div key={log.id} className="flex gap-3 py-2 border-b border-[#1e2233] last:border-0 text-xs">
            <span>{log.status === 'ok' ? '✅' : '❌'}</span>
            <span className="text-[#9ca3af]">{log.type}</span>
            <span className="text-[#6b7280]">{log.message}</span>
            <span className="ml-auto text-[#4b5563]">{log.syncedAt?.split('T')[0]}</span>
          </div>
        ))}
        {logs.length === 0 && <p className="text-[#6b7280] text-sm py-2">Синхронизаций ещё не было.</p>}
      </div>
    </div>
  )
}
