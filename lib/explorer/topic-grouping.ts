// Слабая группировка тем (pain/positive) от Claude:
// сводим формулировки вроде «плохое качество» / «низкое качество» в один кластер
// по пересечению значимых токенов (Jaccard ≥ 0.5).

const STOPWORDS = new Set([
  // RU short / function words
  'и', 'в', 'на', 'с', 'по', 'для', 'не', 'но', 'это', 'как', 'у', 'из', 'к', 'до',
  'от', 'при', 'или', 'же', 'a', 'an', 'the', 'of', 'in', 'to', 'is', 'are', 'be', 'too',
  // частые «слабые» слова
  'есть', 'нет', 'был', 'была', 'было', 'очень', 'просто', 'товар', 'продукт', 'вещь',
])

export function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[.,!?;:()«»"'`\-—–]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  )
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union ? inter / union : 0
}

export interface TopicWithRun {
  runId: string
  keyword: string
  topic: string
  count: number
}

export interface TopicGroup {
  canonical: string
  variants: string[] // уникальные формулировки внутри группы
  totalCount: number // сумма count по всем нишам
  niches: { runId: string; keyword: string; count: number }[]
}

const SIM_THRESHOLD = 0.5

export function groupTopics(items: TopicWithRun[]): TopicGroup[] {
  // Сначала собираем уникальные topic-строки с их токенами и общим count'ом
  const uniques = new Map<string, { tokens: Set<string>; totalCount: number; entries: TopicWithRun[] }>()
  for (const it of items) {
    const key = it.topic.trim()
    if (!key) continue
    const u = uniques.get(key)
    if (u) {
      u.totalCount += it.count
      u.entries.push(it)
    } else {
      uniques.set(key, { tokens: tokenize(key), totalCount: it.count, entries: [it] })
    }
  }

  const sorted = [...uniques.entries()].sort((a, b) => b[1].totalCount - a[1].totalCount)

  type Cluster = {
    canonical: string
    canonicalTokens: Set<string>
    variants: string[]
    entries: TopicWithRun[]
  }
  const clusters: Cluster[] = []

  for (const [topic, info] of sorted) {
    // Найти ближайший кластер
    let best: { idx: number; sim: number } | null = null
    for (let i = 0; i < clusters.length; i++) {
      const s = jaccard(info.tokens, clusters[i].canonicalTokens)
      if (s >= SIM_THRESHOLD && (!best || s > best.sim)) best = { idx: i, sim: s }
    }
    if (best) {
      clusters[best.idx].variants.push(topic)
      clusters[best.idx].entries.push(...info.entries)
    } else {
      clusters.push({
        canonical: topic,
        canonicalTokens: info.tokens,
        variants: [topic],
        entries: [...info.entries],
      })
    }
  }

  // Сворачиваем кластеры в группы
  const groups: TopicGroup[] = clusters.map((c) => {
    const nicheMap = new Map<string, { keyword: string; count: number }>()
    for (const e of c.entries) {
      const prev = nicheMap.get(e.runId)
      if (prev) prev.count += e.count
      else nicheMap.set(e.runId, { keyword: e.keyword, count: e.count })
    }
    return {
      canonical: c.canonical,
      variants: Array.from(new Set(c.variants)),
      totalCount: c.entries.reduce((s, x) => s + x.count, 0),
      niches: [...nicheMap.entries()]
        .map(([runId, v]) => ({ runId, keyword: v.keyword, count: v.count }))
        .sort((a, b) => b.count - a.count),
    }
  })

  // Сортировка: сначала больше ниш, потом больше суммарный count
  return groups.sort((a, b) => b.niches.length - a.niches.length || b.totalCount - a.totalCount)
}
