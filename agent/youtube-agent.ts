import 'dotenv/config'

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

// ── Telegram ──────────────────────────────────────────────────────────────────

async function tgSend(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return
  // Split long messages (Telegram limit 4096 chars)
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000))
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: chunk, parse_mode: 'HTML' }),
    })
  }
}

// ── Search queries ────────────────────────────────────────────────────────────

const SEARCH_QUERIES = [
  '쿠팡 꿀템 추천',
  '쿠팡 추천템',
  '쿠팡 살림템',
  '쿠팡 신박템',
  '쿠팡 하울',
  '쿠팡 리뷰',
  '쿠팡 생활용품',
  '주방용품 추천',
  '살림 꿀템',
  '수납 정리 추천',
  '캠핑 용품 추천',
  '홈오피스 추천',
  '자동차 용품 추천',
  '운동 용품 추천',
  '여행 용품 추천',
  '삶의질 상승템',
  '내돈내산 추천',
  '품절대란 템',
  '신박한 아이디어템',
  '가성비 추천템',
  '쿠팡 신상템',
  '쿠팡 대박템',
  '집꾸미기 추천템',
  '다이소 vs 쿠팡',
  '쿠팡 최저가템',
]

const PRIORITY_CHANNELS = [
  'UCB5-BFHQBPI0u5sAfthdrRA',
  'UC9ujJj67m-2tcdKwHMt6HxA',
  'UCHkJXsSOxoucqmYB6wmHetg',
  'UC8JuXgvoyZiyZT4PtMs6VdA',
  'UCnVriN8O7LPK7yOoYMGoPYA',
  'UC8EtrrYkLcPlYzmYFdkIH0Q',
  'UCoyBk131DpqosrjuKftlBeQ',
  'UCdlipmeXcAi0V3cjMz075Sg',
  'UCyqdxt-1WMH7IPhxMgVKJCQ',
  'UC3N7hBFbjlt1OTyOHPjm70Q',
  'UCSctV5NsoDmlq2O9zxVTwBw',
  'UC2PT1efaWwc_d4tKo8PXTYw',
  'UCPeES6YnKdEEAds6P58I3-g',
  'UC-APCmqJwwPzBdEQDFROeYg',
  'UCEoXbfzxKt5NbmYmnheRnwg',
]

// ── YouTube API ───────────────────────────────────────────────────────────────

type VideoItem = {
  id: string
  title: string
  channelId: string
  channelTitle: string
  publishedAt: string
  viewCount: number
  likeCount: number
  description: string
  thumbnailUrl: string
}

async function ytGet(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: YOUTUBE_API_KEY }).toString()
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${qs}`)
  if (!res.ok) {
    const err = await res.text()
    console.error(`  YouTube API error ${res.status}:`, err.slice(0, 200))
    return null
  }
  return res.json()
}

async function searchVideos(query: string, maxResults = 10): Promise<string[]> {
  const data = await ytGet('search', {
    part: 'id',
    q: query,
    type: 'video',
    regionCode: 'KR',
    relevanceLanguage: 'ko',
    order: 'relevance',
    publishedAfter: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
    maxResults: String(maxResults),
  })
  return (data?.items ?? []).map((i: any) => i.id.videoId).filter(Boolean)
}

async function getChannelVideos(channelId: string, maxResults = 10): Promise<string[]> {
  const data = await ytGet('search', {
    part: 'id',
    channelId,
    type: 'video',
    order: 'date',
    publishedAfter: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
    maxResults: String(maxResults),
  })
  return (data?.items ?? []).map((i: any) => i.id.videoId).filter(Boolean)
}

async function getVideoDetails(videoIds: string[]): Promise<VideoItem[]> {
  if (!videoIds.length) return []
  const chunks: string[][] = []
  for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50))

  const results: VideoItem[] = []
  for (const chunk of chunks) {
    const data = await ytGet('videos', {
      part: 'snippet,statistics',
      id: chunk.join(','),
    })
    if (!data) continue
    for (const item of data.items ?? []) {
      results.push({
        id: item.id,
        title: item.snippet.title,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        viewCount: parseInt(item.statistics?.viewCount ?? '0'),
        likeCount: parseInt(item.statistics?.likeCount ?? '0'),
        description: (item.snippet.description ?? '').slice(0, 500),
        thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? '',
      })
    }
  }
  return results
}

// ── Product extraction ────────────────────────────────────────────────────────

// Korean product keywords often appear as: 제품명 + 추천/리뷰/후기/하울/구매
const PRODUCT_SIGNALS = ['추천', '리뷰', '후기', '하울', '꿀템', '신박', '가성비', '구매', '쇼핑']
const NOISE_WORDS = new Set([
  '쿠팡', '네이버', '아마존', '리뷰', '추천', '하울', '언박싱', '솔직', '진짜', '완전',
  '너무', '정말', '그냥', '이거', '저거', '여기', '오늘', '이번', '다음', '이제',
  '같은', '다른', '좋은', '새로운', '우리', '나의', '내가', '저의',
])

// Products requiring certificates on Coupang — filtered out
const CERT_WORDS = new Set([
  '식품', '음식', '먹거리', '과자', '간식', '음료', '주스', '커피', '차', '라면',
  '국수', '쌀', '고기', '생선', '야채', '과일', '빵', '케이크', '초콜릿', '사탕',
  '화장품', '스킨케어', '로션', '크림', '세럼', '선크림', '마스크팩', '샴푸', '린스',
  '영양제', '보충제', '비타민', '건강식품', '다이어트', '프로틴', '콜라겐',
  '의약', '약품', '의료', '건강기능', '보조제', '한약', '홍삼', '유산균',
  '어린이', '유아', '아기', '신생아', '분유', '기저귀', '유아용',
])

function extractProductMentions(text: string): string[] {
  // Extract 2-8 char Korean noun phrases that look like product names
  const tokens = text
    .replace(/[^가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && t.length <= 10 && !NOISE_WORDS.has(t))

  // Simple heuristic: prefer tokens that appear with signal words nearby
  const words = text.split(/\s+/)
  const productTokens: string[] = []

  words.forEach((word, i) => {
    if (PRODUCT_SIGNALS.some(s => words.slice(Math.max(0, i - 3), i + 3).includes(s))) {
      const clean = word.replace(/[^가-힣]/g, '')
      if (clean.length >= 2 && clean.length <= 10 && !NOISE_WORDS.has(clean)) {
        productTokens.push(clean)
      }
    }
  })

  return [...new Set([...productTokens, ...tokens.slice(0, 5)])]
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreVideo(v: VideoItem): number {
  const ageHours = (Date.now() - new Date(v.publishedAt).getTime()) / (1000 * 3600)
  const ageDays = ageHours / 24
  const recencyBoost = ageDays <= 7 ? 2.0 : ageDays <= 30 ? 1.5 : 1.0
  const engagementRate = v.viewCount > 0 ? v.likeCount / v.viewCount : 0
  const isPriority = PRIORITY_CHANNELS.includes(v.channelId) ? 1.5 : 1.0
  return Math.log10(v.viewCount + 1) * recencyBoost * (1 + engagementRate * 10) * isPriority
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  if (!YOUTUBE_API_KEY) {
    console.error('❌ YOUTUBE_API_KEY не задан в .env')
    process.exit(1)
  }

  const allVideoIds = new Set<string>()

  // Search all Korean YouTube by queries
  console.log(`\n🔍 Поиск по ${SEARCH_QUERIES.length} запросам (весь корейский YouTube)...`)
  for (const query of SEARCH_QUERIES) {
    const ids = await searchVideos(query, 15)
    ids.forEach(id => allVideoIds.add(id))
    process.stdout.write('.')
  }
  console.log(` (${allVideoIds.size} уникальных видео)`)

  console.log(`\n📊 Загружаю детали...`)
  const videos = await getVideoDetails([...allVideoIds])
  console.log(`  Загружено: ${videos.length} видео`)

  // Filter out cert-required product videos
  const filtered = videos.filter(v => {
    const text = (v.title + ' ' + v.description).toLowerCase()
    return ![...CERT_WORDS].some(w => text.includes(w))
  })
  console.log(`  После фильтра (без сертификатов): ${filtered.length} видео`)

  // Sort by score
  const scored = filtered
    .map(v => ({ ...v, score: scoreVideo(v) }))
    .sort((a, b) => b.score - a.score)

  // Product frequency across titles
  const productFreq: Record<string, { count: number; views: number; videos: string[] }> = {}
  for (const v of scored.slice(0, 50)) {
    const mentions = extractProductMentions(v.title + ' ' + v.description)
    mentions.forEach(p => {
      if (!productFreq[p]) productFreq[p] = { count: 0, views: 0, videos: [] }
      productFreq[p].count++
      productFreq[p].views += v.viewCount
      if (productFreq[p].videos.length < 3) productFreq[p].videos.push(v.title.slice(0, 40))
    })
  }

  const topProducts = Object.entries(productFreq)
    .filter(([, d]) => d.count >= 2)
    .sort((a, b) => b[1].count * Math.log10(b[1].views + 1) - a[1].count * Math.log10(a[1].views + 1))
    .slice(0, 20)

  // Output
  console.log('\n' + '═'.repeat(70))
  console.log('YOUTUBE ТРЕНДЫ: КОРЕЙСКИЕ ТОВАРЫ')
  console.log(`Данные за последние 90 дней | ${videos.length} видео проанализировано`)
  console.log('═'.repeat(70))

  console.log('\n🏆 ТОП ВИДЕО (по охвату + свежести):')
  scored.slice(0, 10).forEach((v, i) => {
    const age = Math.round((Date.now() - new Date(v.publishedAt).getTime()) / (1000 * 3600 * 24))
    const isPriority = PRIORITY_CHANNELS.includes(v.channelId) ? ' ⭐' : ''
    console.log(`  ${i + 1}. ${v.title.slice(0, 55)}`)
    console.log(`     ${v.channelTitle}${isPriority} | ${v.viewCount.toLocaleString()} просм | ${age}д назад`)
  })

  if (topProducts.length) {
    console.log('\n📦 УПОМИНАЕМЫЕ ТОВАРЫ/ТЕМЫ:')
    topProducts.forEach(([product, data], i) => {
      console.log(`  ${i + 1}. ${product.padEnd(15)} упомянут ${data.count}х | ${data.views.toLocaleString()} суммарных просм`)
      if (data.videos[0]) console.log(`     → "${data.videos[0]}"`)
    })
  }

  console.log('\n📅 СВЕЖИЕ ВИДЕО (последние 7 дней):')
  const recent = scored
    .filter(v => Date.now() - new Date(v.publishedAt).getTime() < 7 * 24 * 3600 * 1000)
    .slice(0, 8)
  if (recent.length) {
    recent.forEach(v => {
      const isPriority = PRIORITY_CHANNELS.includes(v.channelId) ? ' ⭐' : ''
      console.log(`  • ${v.title.slice(0, 55)}`)
      console.log(`    ${v.channelTitle}${isPriority} | ${v.viewCount.toLocaleString()} просм`)
    })
  } else {
    console.log('  Нет видео за последние 7 дней')
  }

  console.log('\n' + '═'.repeat(70))
  console.log(`Квота использована: ~${Math.ceil(allVideoIds.size / 50 + SEARCH_QUERIES.length)} units`)
  console.log('═'.repeat(70))

  // ── Telegram report ──
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    const date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    const lines: string[] = []
    lines.push(`🎬 <b>YouTube Тренды Корея</b> — ${date}`)
    lines.push(`📊 Проанализировано: ${videos.length} видео\n`)

    lines.push('🏆 <b>ТОП ВИДЕО</b>')
    scored.slice(0, 7).forEach((v, i) => {
      const age = Math.round((Date.now() - new Date(v.publishedAt).getTime()) / (1000 * 3600 * 24))
      const star = PRIORITY_CHANNELS.includes(v.channelId) ? ' ⭐' : ''
      lines.push(`${i + 1}. <a href="https://youtu.be/${v.id}">${v.title.slice(0, 50)}</a>`)
      lines.push(`   ${v.channelTitle}${star} | ${v.viewCount.toLocaleString()} просм | ${age}д назад`)
    })

    if (topProducts.length) {
      lines.push('\n📦 <b>ГОРЯЧИЕ ТОВАРЫ/ТЕМЫ</b>')
      topProducts.slice(0, 10).forEach(([product, data], i) => {
        lines.push(`${i + 1}. <b>${product}</b> — ${data.count}х упомянут | ${data.views.toLocaleString()} просм`)
      })
    }

    const freshVideos = scored.filter(v => Date.now() - new Date(v.publishedAt).getTime() < 7 * 24 * 3600 * 1000).slice(0, 5)
    if (freshVideos.length) {
      lines.push('\n📅 <b>СВЕЖИЕ (7 дней)</b>')
      freshVideos.forEach(v => {
        const star = PRIORITY_CHANNELS.includes(v.channelId) ? ' ⭐' : ''
        lines.push(`• <a href="https://youtu.be/${v.id}">${v.title.slice(0, 50)}</a>`)
        lines.push(`  ${v.channelTitle}${star} | ${v.viewCount.toLocaleString()} просм`)
      })
    }

    await tgSend(lines.join('\n'))
    console.log('✅ Отправлено в Telegram')
  }
}

run().catch(console.error)
