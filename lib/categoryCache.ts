import type { FlatCategory } from './coupang/categories'

const KEY = 'coupang_categories'
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 дней

interface CacheEntry {
  data: FlatCategory[]
  savedAt: number
}

export function getCachedCategories(): FlatCategory[] | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (Date.now() - entry.savedAt > TTL_MS) return null
    return entry.data
  } catch {
    return null
  }
}

export function setCachedCategories(data: FlatCategory[]) {
  try {
    const entry: CacheEntry = { data, savedAt: Date.now() }
    localStorage.setItem(KEY, JSON.stringify(entry))
  } catch {
    // localStorage может быть недоступен
  }
}

export function getCacheMeta(): { savedAt: number; expiresAt: number } | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    return { savedAt: entry.savedAt, expiresAt: entry.savedAt + TTL_MS }
  } catch {
    return null
  }
}

export function clearCategoryCache() {
  localStorage.removeItem(KEY)
}
