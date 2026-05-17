import 'dotenv/config'
import { createHmac } from 'crypto'

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID!
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET!
const NAVER_AD_API_KEY = process.env.NAVER_AD_API_KEY!
const NAVER_AD_SECRET_KEY = process.env.NAVER_AD_SECRET_KEY!
const NAVER_AD_CUSTOMER_ID = process.env.NAVER_AD_CUSTOMER_ID!

// ── Naver Ad API ──────────────────────────────────────────────────────────────

function adHeaders(method: string, path: string) {
  const ts = Date.now()
  const sig = createHmac('sha256', NAVER_AD_SECRET_KEY)
    .update(`${ts}.${method}.${path}`)
    .digest('base64')
  return {
    'X-Timestamp': String(ts),
    'X-API-KEY': NAVER_AD_API_KEY,
    'X-Customer': NAVER_AD_CUSTOMER_ID,
    'X-Signature': sig,
    'Content-Type': 'application/json',
  }
}

async function fetchKeywordVolumes(keywords: string[]) {
  const path = '/keywordstool'
  const qs = `hintKeywords=${encodeURIComponent(keywords.join(','))}&showDetail=1`
  const res = await fetch(`https://api.searchad.naver.com${path}?${qs}`, {
    headers: adHeaders('GET', path),
  })
  const data = await res.json()
  return (data.keywordList ?? []) as Array<{
    relKeyword: string
    monthlyPcQcCnt: number | string
    monthlyMobileQcCnt: number | string
    compIdx: string
    plAvgDepth: number
  }>
}

// ── Naver DataLab Search Trends ───────────────────────────────────────────────

function naverHeaders() {
  return {
    'X-Naver-Client-Id': NAVER_CLIENT_ID,
    'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    'Content-Type': 'application/json',
  }
}

async function fetchTrends(keyword: string) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 12)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: naverHeaders(),
    body: JSON.stringify({
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      timeUnit: 'month',
      keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('  Trends error:', res.status, err.slice(0, 100))
    return null
  }
  const data = await res.json()
  return data.results?.[0]?.data as Array<{ period: string; ratio: number }> | undefined
}

// ── Naver Shopping Search ─────────────────────────────────────────────────────

async function fetchShoppingResults(keyword: string, display = 30) {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${display}&sort=sim`
  const res = await fetch(url, { headers: naverHeaders() })
  if (!res.ok) {
    const err = await res.text()
    console.error('  Shopping error:', res.status, err.slice(0, 100))
    return []
  }
  const data = await res.json()
  return (data.items ?? []) as Array<{
    title: string
    link: string
    lprice: string
    hprice: string
    mallName: string
    brand: string
    category1: string
    category2: string
    category3: string
  }>
}

// ── Naver Shopping Insight ────────────────────────────────────────────────────

const SHOPPING_CATEGORY_MAP: Record<string, string> = {
  '패션의류': '50000000',
  '패션잡화': '50000001',
  '화장품/미용': '50000002',
  '디지털/가전': '50000003',
  '가구/인테리어': '50000004',
  '식품': '50000005',
  '스포츠/레저': '50000006',
  '생활/건강': '50000007',
  '여행/문화': '50000008',
  '출산/육아': '50000009',
  '반려동물': '50000010',
  '자동차용품': '50000011',
}

function detectCategoryCode(products: Awaited<ReturnType<typeof fetchShoppingResults>>): { code: string; name: string } {
  const counts: Record<string, number> = {}
  products.forEach(p => { if (p.category1) counts[p.category1] = (counts[p.category1] ?? 0) + 1 })
  const topName = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const code = SHOPPING_CATEGORY_MAP[topName] ?? '50000007'
  const name = topName || '생활/건강'
  return { code, name }
}

async function fetchShoppingInsight(keyword: string, categoryCode: string) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 12)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const res = await fetch('https://openapi.naver.com/v1/datalab/shopping/category/keywords', {
    method: 'POST',
    headers: naverHeaders(),
    body: JSON.stringify({
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      timeUnit: 'month',
      category: categoryCode,
      keyword: [{ name: keyword, param: [keyword] }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0]?.data as Array<{ period: string; ratio: number }> | undefined
}

// ── Analysis ──────────────────────────────────────────────────────────────────

function analyzePrices(items: Awaited<ReturnType<typeof fetchShoppingResults>>) {
  const prices = items.map(i => parseInt(i.lprice)).filter(p => p > 0).sort((a, b) => a - b)
  if (!prices.length) return null
  const min = prices[0]
  const max = prices[prices.length - 1]
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
  const median = prices[Math.floor(prices.length / 2)]
  const buckets: Record<string, number> = {}
  prices.forEach(p => {
    const k = Math.floor(p / 5000) * 5000
    const label = `${k.toLocaleString()}~${(k + 4999).toLocaleString()}`
    buckets[label] = (buckets[label] ?? 0) + 1
  })
  return { min, max, avg, median, buckets, count: prices.length }
}

function analyzeTrends(data: Array<{ period: string; ratio: number }> | null | undefined) {
  if (!data || data.length < 4) return null
  const recent3 = data.slice(-3).map(d => d.ratio)
  const prev3 = data.slice(-6, -3).map(d => d.ratio)
  const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length
  const prevAvg = prev3.reduce((a, b) => a + b, 0) / prev3.length || 1
  const change = ((recentAvg - prevAvg) / prevAvg) * 100
  const peak = Math.max(...data.map(d => d.ratio))
  const current = data[data.length - 1].ratio
  return { recentAvg: Math.round(recentAvg), change: Math.round(change), peak, current, months: data }
}

// ── Listing Generator ─────────────────────────────────────────────────────────

function generateListing(data: {
  keyword: string
  volumes: Awaited<ReturnType<typeof fetchKeywordVolumes>>
  prices: ReturnType<typeof analyzePrices>
  products: Awaited<ReturnType<typeof fetchShoppingResults>>
}) {
  const { keyword, volumes, prices, products } = data

  // Frequency analysis of competitor title words
  const wordCounts: Record<string, number> = {}
  products.slice(0, 15).forEach(p => {
    const clean = p.title.replace(/<[^>]+>/g, '')
    clean.split(/[\s,]+/).forEach(w => {
      if (w.length > 1 && w !== keyword) wordCounts[w] = (wordCounts[w] ?? 0) + 1
    })
  })
  const hotWords = Object.entries(wordCounts)
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w)

  // Keywords: volume > 100, not high competition, sorted by volume
  const kwList = volumes
    .filter(k => {
      const v = k.monthlyPcQcCnt === '< 10' ? 0 : Number(k.monthlyPcQcCnt) + Number(k.monthlyMobileQcCnt)
      return v > 100
    })
    .sort((a, b) => {
      const va = a.monthlyPcQcCnt === '< 10' ? 0 : Number(a.monthlyPcQcCnt) + Number(a.monthlyMobileQcCnt as number)
      const vb = b.monthlyPcQcCnt === '< 10' ? 0 : Number(b.monthlyPcQcCnt) + Number(b.monthlyMobileQcCnt as number)
      return vb - va
    })
    .slice(0, 8)

  const titleBase = [keyword, ...hotWords.slice(0, 3)].join(' ')
  const titleFull = titleBase.slice(0, 100)

  const lines: string[] = []
  lines.push(`\n─── ЛИСТИНГ (автогенерация) ─────────────────────────────`)
  lines.push(`  Название: ${titleFull}`)
  if (hotWords.length) {
    lines.push(`  Атрибуты у конкурентов: ${hotWords.join(' | ')}`)
  }
  lines.push(`  Ключевые слова для листинга:`)
  kwList.forEach((k, i) => {
    const v = k.monthlyPcQcCnt === '< 10' ? '< 10'
      : Number(k.monthlyPcQcCnt) + Number(k.monthlyMobileQcCnt)
    lines.push(`    ${i + 1}. ${k.relKeyword.padEnd(22)} ${String(v).padStart(7)}/мес`)
  })
  if (prices) {
    const entry = Math.round(prices.median * 0.95 / 100) * 100
    lines.push(`  Рекомендованная цена входа: ${entry.toLocaleString()}₩`)
  }

  return lines.join('\n')
}

// ── Smart verdict ─────────────────────────────────────────────────────────────

function compLabel(idx: string) {
  if (idx === '높음') return 'Высокая'
  if (idx === '중간') return 'Средняя'
  if (idx === '낮음') return 'Низкая'
  return idx
}

type ResearchData = {
  keyword: string
  volumes: Awaited<ReturnType<typeof fetchKeywordVolumes>>
  trends: ReturnType<typeof analyzeTrends>
  insight: ReturnType<typeof analyzeTrends>
  prices: ReturnType<typeof analyzePrices>
  products: Awaited<ReturnType<typeof fetchShoppingResults>>
  categoryName: string
}

function getVolumeTotal(main: ResearchData['volumes'][0] | undefined) {
  if (!main) return 0
  if (main.monthlyPcQcCnt === '< 10' || main.monthlyMobileQcCnt === '< 10') return 0
  return Number(main.monthlyPcQcCnt) + Number(main.monthlyMobileQcCnt)
}

function generateSmartReport(data: ResearchData) {
  const { keyword, volumes, trends, insight, prices, products, categoryName } = data

  const main = volumes.find(k => k.relKeyword === keyword) ?? volumes[0]
  const totalVol = getVolumeTotal(main)
  const comp = main?.compIdx ?? ''

  let verdict = '⚠️  ТЕСТИРОВАТЬ'
  let verdictReason = ''
  if (totalVol > 50000 && comp === '높음') {
    verdict = '🔴 ИЗБЕГАТЬ'
    verdictReason = 'Огромный спрос, но рынок перегрет — очень высокая конкуренция'
  } else if (totalVol > 50000 && comp === '중간') {
    verdict = '🟡 ТЕСТИРОВАТЬ'
    verdictReason = 'Высокий спрос со средней конкуренцией — есть шанс при сильном листинге'
  } else if (totalVol > 20000 && comp === '낮음') {
    verdict = '🟢 ЗАПУСКАТЬ'
    verdictReason = 'Хороший спрос при низкой конкуренции — отличная возможность'
  } else if (totalVol > 10000 && comp !== '높음') {
    verdict = '🟡 ТЕСТИРОВАТЬ'
    verdictReason = 'Умеренный спрос, конкуренция управляемая'
  } else if (totalVol < 5000) {
    verdict = '🔴 ИЗБЕГАТЬ'
    verdictReason = 'Слишком низкий объём поиска — рынок слишком мал'
  }

  const topKws = volumes
    .filter(k => {
      const v = k.monthlyPcQcCnt === '< 10' || k.monthlyMobileQcCnt === '< 10'
        ? 0 : Number(k.monthlyPcQcCnt) + Number(k.monthlyMobileQcCnt)
      return v > 500 && k.compIdx !== '높음'
    })
    .sort((a, b) => {
      const va = a.monthlyPcQcCnt === '< 10' ? 0 : Number(a.monthlyPcQcCnt) + Number(a.monthlyMobileQcCnt as number)
      const vb = b.monthlyPcQcCnt === '< 10' ? 0 : Number(b.monthlyPcQcCnt) + Number(b.monthlyMobileQcCnt as number)
      return vb - va
    })
    .slice(0, 5)

  let priceRec = ''
  if (prices) {
    const entry = Math.round(prices.median * 0.95 / 100) * 100
    priceRec = `${entry.toLocaleString()}₩ (чуть ниже медианы ${prices.median.toLocaleString()}₩)`
  }

  let trendNote = ''
  if (trends) {
    if (trends.change > 20) trendNote = `📈 Растущий тренд (+${trends.change}% за 3 мес)`
    else if (trends.change < -20) trendNote = `📉 Падающий тренд (${trends.change}% за 3 мес)`
    else trendNote = `➡️  Стабильный спрос (${trends.change > 0 ? '+' : ''}${trends.change}% за 3 мес)`
    if (trends.current < trends.peak * 0.3) trendNote += ' — сейчас не в сезоне'
  }

  let insightNote = ''
  if (insight) {
    if (insight.change > 20) insightNote = `📈 +${insight.change}% (покупки растут)`
    else if (insight.change < -20) insightNote = `📉 ${insight.change}% (покупки падают)`
    else insightNote = `➡️  ${insight.change > 0 ? '+' : ''}${insight.change}% (стабильно)`
  }

  const lines: string[] = []
  lines.push(`\n╔${'═'.repeat(58)}╗`)
  lines.push(`║  ВЕРДИКТ: ${verdict.padEnd(47)}║`)
  lines.push(`╚${'═'.repeat(58)}╝`)
  lines.push(`  ${verdictReason}`)

  lines.push(`\n─── СПРОС ───────────────────────────────────────────────`)
  lines.push(`  Объём поиска: ${totalVol.toLocaleString()} запросов/мес`)
  lines.push(`  Конкуренция:  ${compLabel(comp)}`)
  if (trendNote) lines.push(`  Поиск:        ${trendNote}`)
  if (insightNote) lines.push(`  Покупки:      ${insightNote}  [${categoryName}]`)

  if (prices) {
    lines.push(`\n─── ЦЕНЫ (${prices.count} товаров) ─────────────────────────────`)
    lines.push(`  Мин:     ${prices.min.toLocaleString()}₩`)
    lines.push(`  Медиана: ${prices.median.toLocaleString()}₩`)
    lines.push(`  Средняя: ${prices.avg.toLocaleString()}₩`)
    lines.push(`  Макс:    ${prices.max.toLocaleString()}₩`)
    if (priceRec) lines.push(`  Рекомендуемая цена входа: ${priceRec}`)
    const top3 = Object.entries(prices.buckets).sort((a, b) => b[1] - a[1]).slice(0, 3)
    lines.push(`  Популярные диапазоны: ${top3.map(([r, c]) => `${r}₩ (${c}шт)`).join(' | ')}`)
  }

  if (topKws.length) {
    lines.push(`\n─── КЛЮЧЕВЫЕ СЛОВА ДЛЯ ЛИСТИНГА ────────────────────────`)
    topKws.forEach((k, i) => {
      const v = k.monthlyPcQcCnt === '< 10' ? '< 10'
        : Number(k.monthlyPcQcCnt) + Number(k.monthlyMobileQcCnt)
      lines.push(`  ${i + 1}. ${k.relKeyword.padEnd(22)} ${String(v).padStart(7)}/мес  [${compLabel(k.compIdx)}]`)
    })
  }

  if (products.length) {
    lines.push(`\n─── ТОП КОНКУРЕНТЫ ──────────────────────────────────────`)
    products.slice(0, 5).forEach((p, i) => {
      const title = p.title.replace(/<[^>]+>/g, '').slice(0, 40)
      lines.push(`  ${i + 1}. ${title}`)
      lines.push(`     ${p.mallName} | ${parseInt(p.lprice).toLocaleString()}₩`)
    })
  }

  lines.push(generateListing({ keyword, volumes, prices, products }))

  lines.push(`\n─── РИСКИ ───────────────────────────────────────────────`)
  if (comp === '높음') lines.push('  ⚠️  Высокая конкуренция — нужен уникальный листинг или нишевый вариант')
  if (trends && trends.current < trends.peak * 0.5) lines.push('  ⚠️  Сезонный товар — сейчас не пик спроса')
  if (prices && prices.min < 5000) lines.push('  ⚠️  Есть очень дешёвые конкуренты — ценовое давление снизу')
  if (totalVol > 100000) lines.push('  ⚠️  Очень широкая ниша — сложно ранжироваться без рекламы')
  if (lines[lines.length - 1].startsWith('\n─── РИСКИ')) lines.push('  ✅ Явных рисков не выявлено')

  return lines.join('\n')
}

// ── Single research ───────────────────────────────────────────────────────────

async function research(keyword: string) {
  console.log(`\n🔍 Исследование: "${keyword}"\n`)

  console.log('1/5 Объём поиска и ключевые слова...')
  const volumes = await fetchKeywordVolumes([keyword])

  console.log('2/5 Тренды поиска за 12 месяцев...')
  const rawTrends = await fetchTrends(keyword)
  const trends = analyzeTrends(rawTrends)

  console.log('3/5 Конкуренты и цены (Naver Shopping)...')
  const products = await fetchShoppingResults(keyword, 30)
  const prices = analyzePrices(products)

  console.log('4/5 Shopping Insight (тренд покупок)...')
  const { code: categoryCode, name: categoryName } = detectCategoryCode(products)
  const rawInsight = await fetchShoppingInsight(keyword, categoryCode)
  const insight = analyzeTrends(rawInsight)

  console.log('5/5 Анализ...\n')

  console.log('═'.repeat(60))
  console.log(`ИССЛЕДОВАНИЕ ТОВАРА: ${keyword}`)
  console.log('═'.repeat(60))

  if (volumes.length) {
    console.log('\n📊 Объём поиска (ключевые слова):')
    volumes.slice(0, 10).forEach(k => {
      const total = k.monthlyPcQcCnt === '< 10' || k.monthlyMobileQcCnt === '< 10'
        ? '< 10'
        : Number(k.monthlyPcQcCnt) + Number(k.monthlyMobileQcCnt)
      console.log(`  ${k.relKeyword.padEnd(25)} ${String(total).padStart(8)}/мес  [${compLabel(k.compIdx)}]`)
    })
  }

  if (trends) {
    console.log('\n📈 Тренд поиска (12 мес):')
    const spark = trends.months.slice(-12).map(d =>
      '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor((d.ratio / (trends.peak || 1)) * 7))]
    ).join('')
    console.log(`  ${spark}`)
    console.log(`  Текущий: ${trends.current}/100 | Изменение: ${trends.change > 0 ? '+' : ''}${trends.change}% | Пик: ${trends.peak}/100`)
  }

  if (insight) {
    console.log(`\n🛒 Тренд покупок Shopping Insight [${categoryName}]:`)
    const spark = insight.months.slice(-12).map(d =>
      '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor((d.ratio / (insight.peak || 1)) * 7))]
    ).join('')
    console.log(`  ${spark}`)
    console.log(`  Текущий: ${insight.current}/100 | Изменение: ${insight.change > 0 ? '+' : ''}${insight.change}% | Пик: ${insight.peak}/100`)
  }

  console.log(generateSmartReport({ keyword, volumes, trends, insight, prices, products, categoryName }))
  console.log('═'.repeat(60))
}

// ── Batch comparison ──────────────────────────────────────────────────────────

async function researchBatch(keywords: string[]) {
  type Row = {
    keyword: string
    volume: number
    comp: string
    trendChange: number | null
    insightChange: number | null
    medianPrice: number | null
    verdict: string
  }

  const rows: Row[] = []

  for (const keyword of keywords) {
    process.stdout.write(`  Исследую: ${keyword}... `)
    const [volumes, rawTrends, products] = await Promise.all([
      fetchKeywordVolumes([keyword]),
      fetchTrends(keyword),
      fetchShoppingResults(keyword, 20),
    ])
    const trends = analyzeTrends(rawTrends)
    const prices = analyzePrices(products)
    const { code, name: categoryName } = detectCategoryCode(products)
    const rawInsight = await fetchShoppingInsight(keyword, code)
    const insight = analyzeTrends(rawInsight)

    const main = volumes.find(k => k.relKeyword === keyword) ?? volumes[0]
    const volume = getVolumeTotal(main)
    const comp = main?.compIdx ?? ''

    let verdict = '🟡 ТЕСТ'
    if (volume > 50000 && comp === '높음') verdict = '🔴 ИЗБЕГАТЬ'
    else if (volume > 50000 && comp === '중간') verdict = '🟡 ТЕСТ'
    else if (volume > 20000 && comp === '낮음') verdict = '🟢 ЗАПУСК'
    else if (volume > 10000 && comp !== '높음') verdict = '🟡 ТЕСТ'
    else if (volume < 5000) verdict = '🔴 ИЗБЕГАТЬ'

    rows.push({
      keyword,
      volume,
      comp: compLabel(comp),
      trendChange: trends?.change ?? null,
      insightChange: insight?.change ?? null,
      medianPrice: prices?.median ?? null,
    })
    console.log(`✓  [${categoryName}]`)
  }

  console.log('\n' + '═'.repeat(90))
  console.log('СРАВНИТЕЛЬНАЯ ТАБЛИЦА')
  console.log('═'.repeat(90))
  console.log(
    'Товар'.padEnd(22) +
    'Объём/мес'.padStart(12) +
    'Конкуренция'.padStart(14) +
    'Поиск'.padStart(8) +
    'Покупки'.padStart(10) +
    'Медиана₩'.padStart(12) +
    '  Вердикт'
  )
  console.log('─'.repeat(90))

  rows.forEach(r => {
    const trend = r.trendChange !== null ? `${r.trendChange > 0 ? '+' : ''}${r.trendChange}%` : '  —'
    const ins = r.insightChange !== null ? `${r.insightChange > 0 ? '+' : ''}${r.insightChange}%` : '  —'
    const price = r.medianPrice !== null ? r.medianPrice.toLocaleString() : '—'

    let verdict = '🟡 ТЕСТ'
    if (r.volume > 50000 && r.comp === 'Высокая') verdict = '🔴 ИЗБЕГАТЬ'
    else if (r.volume > 20000 && r.comp === 'Низкая') verdict = '🟢 ЗАПУСК'
    else if (r.volume < 5000) verdict = '🔴 ИЗБЕГАТЬ'

    console.log(
      r.keyword.padEnd(22) +
      r.volume.toLocaleString().padStart(12) +
      r.comp.padStart(14) +
      trend.padStart(8) +
      ins.padStart(10) +
      price.padStart(12) +
      `  ${verdict}`
    )
  })
  console.log('═'.repeat(90))
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
if (!args.length) {
  console.error('Usage:')
  console.error('  npx tsx research.ts <keyword>              — полный отчёт')
  console.error('  npx tsx research.ts <kw1> <kw2> <kw3>     — сравнительная таблица')
  console.error('Example: npx tsx research.ts 옷걸이')
  console.error('Example: npx tsx research.ts 옷걸이 행거 옷장')
  process.exit(1)
}

if (args.length === 1) {
  research(args[0]).catch(console.error)
} else {
  console.log(`\n📊 Batch-исследование: ${args.join(', ')}\n`)
  researchBatch(args).catch(console.error)
}
