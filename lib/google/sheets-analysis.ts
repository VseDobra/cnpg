import { google, sheets_v4 } from 'googleapis'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export interface Review {
  productId: string
  productName: string
  reviewId: string | number
  rating: number
  date: string
  reviewer: string
  helpful: number
  title: string
  content: string
}

export interface Product {
  productId: string
  name: string
  price: number
  originalPrice: number
  discountPct: number
  couponDiscount: number
  currency: string
  rating: number
  reviewCount: number
  imageCount: number
  firstImage: string
  category: string
  url: string
  sku: string
  availability: string
  isRocket: boolean
  isWow: boolean
  recentBuyers: number | null
  seller: string
}

export interface Verdict {
  level: 'GO' | 'MAYBE' | 'SKIP'
  emoji: string
  text: string
  reasons: string[]
  metrics: Record<string, number | string>
}

const median = (arr: number[]) => {
  const a = arr.filter((n) => Number.isFinite(n) && n > 0).slice().sort((x, y) => x - y)
  if (!a.length) return 0
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
const avg = (arr: number[]) => {
  const a = arr.filter((n) => Number.isFinite(n) && n > 0)
  return a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0
}

function computeVerdict(products: Product[], reviews: Review[]): Verdict {
  const prices = products.map((p) => p.price)
  const ratings = products.map((p) => p.rating)
  const reviewCounts = products.map((p) => p.reviewCount)
  const totalReviews = reviewCounts.reduce((s, n) => s + n, 0)
  const top3Reviews = reviewCounts.slice().sort((a, b) => b - a).slice(0, 3).reduce((s, n) => s + n, 0)
  const concentrationTop3 = totalReviews > 0 ? top3Reviews / totalReviews : 0

  const sellers = new Set(products.map((p) => p.seller).filter(Boolean))
  const rocketShare = products.filter((p) => p.isRocket).length / Math.max(1, products.length)
  const medPrice = median(prices)
  const avgRating = avg(ratings)
  const medReviews = median(reviewCounts)

  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as Record<number, number>
  for (const r of reviews) {
    const k = Math.max(1, Math.min(5, Math.round(r.rating)))
    dist[k]++
  }
  const totalDist = Object.values(dist).reduce((s, n) => s + n, 0)
  const negShare = totalDist ? (dist[1] + dist[2]) / totalDist : 0

  const reasons: string[] = []
  let goScore = 0

  // Demand: enough product market activity
  if (products.length >= 15) { goScore++; reasons.push(`✓ ${products.length} активных листингов`) }
  else reasons.push(`⚠️ только ${products.length} листингов — рынок узкий`)

  if (medReviews >= 30) { goScore++; reasons.push(`✓ медиана ${medReviews} отзывов — спрос есть`) }
  else if (medReviews >= 10) reasons.push(`〜 медиана ${medReviews} отзывов — спрос слабый`)
  else reasons.push(`✗ медиана ${medReviews} отзывов — нет спроса`)

  // Quality gap (opportunity to compete on quality)
  if (avgRating < 4.5 && negShare > 0.05) { goScore++; reasons.push(`✓ средний рейтинг ${avgRating.toFixed(2)}, негатив ${(negShare * 100).toFixed(0)}% — есть куда давить`) }
  else if (avgRating >= 4.7) reasons.push(`✗ средний рейтинг ${avgRating.toFixed(2)} — конкуренты делают слишком хорошо`)
  else reasons.push(`〜 средний рейтинг ${avgRating.toFixed(2)}`)

  // Margin
  if (medPrice >= 10000) { goScore++; reasons.push(`✓ медиана цены ${medPrice.toLocaleString()}₩ — нормальная маржа`) }
  else if (medPrice >= 5000) reasons.push(`〜 медиана цены ${medPrice.toLocaleString()}₩ — тонкая маржа`)
  else reasons.push(`✗ медиана цены ${medPrice.toLocaleString()}₩ — нет маржи`)

  // Concentration (avoid oligopoly)
  if (concentrationTop3 < 0.5) { goScore++; reasons.push(`✓ ТОП-3 держат ${(concentrationTop3 * 100).toFixed(0)}% отзывов — рынок не закрыт`) }
  else if (concentrationTop3 < 0.7) reasons.push(`〜 ТОП-3 держат ${(concentrationTop3 * 100).toFixed(0)}% — концентрация средняя`)
  else reasons.push(`✗ ТОП-3 держат ${(concentrationTop3 * 100).toFixed(0)}% — олигополия`)

  const level: 'GO' | 'MAYBE' | 'SKIP' = goScore >= 4 ? 'GO' : goScore >= 2 ? 'MAYBE' : 'SKIP'
  const emoji = level === 'GO' ? '🟢' : level === 'MAYBE' ? '🟡' : '🔴'

  return {
    level,
    emoji,
    text: `${emoji} ${level} (${goScore}/5)`,
    reasons,
    metrics: {
      products: products.length,
      sellers: sellers.size,
      medianPrice: medPrice,
      avgRating: Number(avgRating.toFixed(2)),
      medianReviewCount: medReviews,
      totalReviewsCollected: reviews.length,
      negativeShare: Number((negShare * 100).toFixed(1)),
      top3Concentration: Number((concentrationTop3 * 100).toFixed(1)),
      rocketShare: Number((rocketShare * 100).toFixed(1)),
    },
  }
}

function titleWordFrequency(products: Product[]): Array<[string, number]> {
  const stop = new Set(['', '1개', '2개', '3개', '4개', '5개'])
  const freq = new Map<string, number>()
  for (const p of products) {
    const tokens = p.name.split(/[\s,()/\\\-_]+/).filter((t) => t.length >= 2 && !stop.has(t))
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  return [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 50)
}

async function ensureSheet(sheets: sheets_v4.Sheets, spreadsheetId: string, title: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existing = meta.data.sheets?.find((s) => s.properties?.title === title)
  if (existing?.properties?.sheetId != null) {
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${title}!A1:Z` })
    return existing.properties.sheetId
  }
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  })
  return res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
}

async function writeRows(sheets: sheets_v4.Sheets, spreadsheetId: string, title: string, rows: (string | number)[][]) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  })
}

async function applyFormatting(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetId: number, opts: { headerCols: number; frozenRows?: number; ratingCol?: number }) {
  const requests: sheets_v4.Schema$Request[] = [
    // Bold header
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: opts.headerCols },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.18, green: 0.2, blue: 0.27 }, horizontalAlignment: 'CENTER' } },
        fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
      },
    },
    // Freeze header
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: opts.frozenRows ?? 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    // Basic filter
    {
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: opts.headerCols } },
      },
    },
  ]
  // Rating colors (1=red ... 5=green)
  if (opts.ratingCol != null) {
    const ratingCol = opts.ratingCol
    const colors = [
      { v: 1, c: { red: 0.95, green: 0.55, blue: 0.55 } },
      { v: 2, c: { red: 0.98, green: 0.75, blue: 0.6 } },
      { v: 3, c: { red: 1.0, green: 0.95, blue: 0.6 } },
      { v: 4, c: { red: 0.75, green: 0.95, blue: 0.75 } },
      { v: 5, c: { red: 0.55, green: 0.9, blue: 0.55 } },
    ]
    for (const { v, c } of colors) {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: ratingCol, endColumnIndex: ratingCol + 1 }],
            booleanRule: { condition: { type: 'NUMBER_EQ', values: [{ userEnteredValue: String(v) }] }, format: { backgroundColor: c } },
          },
          index: 0,
        },
      })
    }
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
}

export async function writeNicheAnalysis(
  spreadsheetId: string,
  baseName: string,
  data: { reviews: Review[]; products: Product[]; keyword?: string },
): Promise<{ tabs: string[]; verdict: Verdict }> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const reviews = data.reviews ?? []
  const products = data.products ?? []
  const verdict = computeVerdict(products, reviews)

  // 1) SUMMARY (главный таб)
  const summaryTab = `${baseName}__summary`
  const summarySheetId = await ensureSheet(sheets, spreadsheetId, summaryTab)
  const m = verdict.metrics
  const summaryRows: (string | number)[][] = [
    ['Ниша', data.keyword ?? ''],
    ['Дата', new Date().toISOString().slice(0, 10)],
    [],
    ['ВЕРДИКТ', verdict.text],
    [],
    ['Метрика', 'Значение'],
    ['Активных листингов', m.products],
    ['Уникальных продавцов', m.sellers],
    ['Медиана цены, ₩', m.medianPrice],
    ['Средний рейтинг', m.avgRating],
    ['Медиана отзывов на товар', m.medianReviewCount],
    ['Всего собрано отзывов', m.totalReviewsCollected],
    ['Доля негатива (1-2★), %', m.negativeShare],
    ['Концентрация ТОП-3, %', m.top3Concentration],
    ['Доля Rocket-доставки, %', m.rocketShare],
    [],
    ['Обоснование'],
    ...verdict.reasons.map((r) => [r]),
  ]
  await writeRows(sheets, spreadsheetId, summaryTab, summaryRows)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: summarySheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 2 },
            cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.6 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        {
          repeatCell: {
            range: { sheetId: summarySheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 2 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.85, green: 0.9, blue: 0.95 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId: summarySheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 250 },
            fields: 'pixelSize',
          },
        },
      ],
    },
  })

  // 2) PRODUCTS — карточки конкурентов
  const productsTab = `${baseName}__products`
  const productsSheetId = await ensureSheet(sheets, spreadsheetId, productsTab)
  const productsHeaders = ['productId', 'name', 'price', 'originalPrice', 'discountPct', 'couponDiscount', 'rating', 'reviewCount', 'imageCount', 'isRocket', 'isWow', 'recentBuyers', 'seller', 'category', 'firstImage', 'url']
  const productsRows: (string | number)[][] = [
    productsHeaders,
    ...products.map((p) => [
      p.productId, p.name, p.price, p.originalPrice, p.discountPct, p.couponDiscount,
      p.rating, p.reviewCount, p.imageCount,
      p.isRocket ? 'Y' : 'N', p.isWow ? 'Y' : 'N',
      p.recentBuyers ?? '', p.seller, p.category, p.firstImage, p.url,
    ]),
  ]
  await writeRows(sheets, spreadsheetId, productsTab, productsRows)
  await applyFormatting(sheets, spreadsheetId, productsSheetId, { headerCols: productsHeaders.length, ratingCol: 6 })

  // 3) REVIEWS — все отзывы
  const reviewsTab = `${baseName}__reviews`
  const reviewsSheetId = await ensureSheet(sheets, spreadsheetId, reviewsTab)
  const reviewsHeaders = ['productId', 'productName', 'reviewId', 'rating', 'date', 'reviewer', 'helpful', 'title', 'content']
  const reviewsRows: (string | number)[][] = [
    reviewsHeaders,
    ...reviews.map((r) => [
      r.productId, r.productName, String(r.reviewId), r.rating, r.date, r.reviewer, r.helpful, r.title, r.content,
    ]),
  ]
  await writeRows(sheets, spreadsheetId, reviewsTab, reviewsRows)
  await applyFormatting(sheets, spreadsheetId, reviewsSheetId, { headerCols: reviewsHeaders.length, ratingCol: 3 })

  // 4) TOP REVIEWS — топ-50 по helpful
  const topTab = `${baseName}__top_reviews`
  const topSheetId = await ensureSheet(sheets, spreadsheetId, topTab)
  const topReviews = [...reviews].sort((a, b) => (b.helpful || 0) - (a.helpful || 0)).slice(0, 50)
  const topRows: (string | number)[][] = [
    reviewsHeaders,
    ...topReviews.map((r) => [
      r.productId, r.productName, String(r.reviewId), r.rating, r.date, r.reviewer, r.helpful, r.title, r.content,
    ]),
  ]
  await writeRows(sheets, spreadsheetId, topTab, topRows)
  await applyFormatting(sheets, spreadsheetId, topSheetId, { headerCols: reviewsHeaders.length, ratingCol: 3 })

  // 5) TITLE PATTERNS — частые слова
  const titlesTab = `${baseName}__titles`
  const titlesSheetId = await ensureSheet(sheets, spreadsheetId, titlesTab)
  const wf = titleWordFrequency(products)
  const titleRows: (string | number)[][] = [['слово', 'встречается'], ...wf]
  await writeRows(sheets, spreadsheetId, titlesTab, titleRows)
  await applyFormatting(sheets, spreadsheetId, titlesSheetId, { headerCols: 2 })

  return {
    tabs: [summaryTab, productsTab, reviewsTab, topTab, titlesTab],
    verdict,
  }
}
