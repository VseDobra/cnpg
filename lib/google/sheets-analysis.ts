import { google, sheets_v4 } from 'googleapis'
import type { NicheSearchSummary, KeywordStat } from '@/lib/naver/ads'
import { computeVerdict, type Verdict } from '@/lib/explorer/verdict'

export type { Verdict } from '@/lib/explorer/verdict'

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
  photos?: string[]
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
  searchRank?: number | null
}

export interface Tag {
  productId: string
  tag: string
  count: number
}

export interface Question {
  productId: string
  questionId: string
  question: string
  answer: string
  askedAt?: string
  answeredAt?: string
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
  data: { reviews: Review[]; products: Product[]; tags?: Tag[]; questions?: Question[]; keyword?: string; searchVolume?: NicheSearchSummary | null },
): Promise<{ tabs: string[]; verdict: Verdict }> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const reviews = data.reviews ?? []
  const products = data.products ?? []
  const tags = data.tags ?? []
  const questions = data.questions ?? []
  const searchVolume = data.searchVolume ?? null
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
  ]
  if (searchVolume) {
    summaryRows.push(
      ['Naver: запросов/мес (seed)', searchVolume.seedMonthlyTotal],
      ['Naver: конкуренция (seed)', searchVolume.seedCompetition],
      ['Naver: глубина рекламы (seed)', searchVolume.seedAdDepth],
      ['Naver: связанных ключей', searchVolume.relatedCount],
      ['Naver: суммарный спрос экосистемы', searchVolume.totalEcosystemSearches],
    )
  }
  summaryRows.push([], ['Обоснование'], ...verdict.reasons.map((r) => [r]))
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

  const writtenTabs = [summaryTab, productsTab, reviewsTab, topTab, titlesTab]

  // 6) PHOTOS — галерея фото из отзывов
  const reviewsWithPhotos = reviews.filter((r) => r.photos && r.photos.length > 0)
  if (reviewsWithPhotos.length) {
    const photosTab = `${baseName}__photos`
    const photosSheetId = await ensureSheet(sheets, spreadsheetId, photosTab)
    const photosHeaders = ['productId', 'productName', 'reviewId', 'rating', 'photoUrl', 'preview']
    const photosRows: (string | number)[][] = [photosHeaders]
    for (const r of reviewsWithPhotos) {
      for (const url of r.photos!) {
        photosRows.push([
          r.productId,
          r.productName,
          String(r.reviewId),
          r.rating,
          url,
          `=IMAGE("${url.replace(/"/g, '')}", 4, 80, 80)`,
        ])
      }
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${photosTab}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: photosRows },
    })
    await applyFormatting(sheets, spreadsheetId, photosSheetId, { headerCols: photosHeaders.length, ratingCol: 3 })
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateDimensionProperties: {
              range: { sheetId: photosSheetId, dimension: 'ROWS', startIndex: 1, endIndex: photosRows.length },
              properties: { pixelSize: 90 },
              fields: 'pixelSize',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId: photosSheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 },
              properties: { pixelSize: 100 },
              fields: 'pixelSize',
            },
          },
        ],
      },
    })
    writtenTabs.push(photosTab)
  }

  // 7) Q&A — вопросы покупателей
  if (questions.length) {
    const qaTab = `${baseName}__qa`
    const qaSheetId = await ensureSheet(sheets, spreadsheetId, qaTab)
    const qaHeaders = ['productId', 'askedAt', 'answeredAt', 'question', 'answer']
    const qaRows: (string | number)[][] = [
      qaHeaders,
      ...questions.map((q) => [q.productId, q.askedAt ?? '', q.answeredAt ?? '', q.question, q.answer]),
    ]
    await writeRows(sheets, spreadsheetId, qaTab, qaRows)
    await applyFormatting(sheets, spreadsheetId, qaSheetId, { headerCols: qaHeaders.length })
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateDimensionProperties: {
              range: { sheetId: qaSheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 5 },
              properties: { pixelSize: 400 },
              fields: 'pixelSize',
            },
          },
        ],
      },
    })
    writtenTabs.push(qaTab)
  }

  // 8a) SEARCH VOLUME — Naver Ads (seed + related)
  if (searchVolume && (searchVolume.seedMonthlyTotal > 0 || searchVolume.relatedTopN.length)) {
    const svTab = `${baseName}__search_volume`
    const svSheetId = await ensureSheet(sheets, spreadsheetId, svTab)
    const svHeaders = ['ключевик', 'PC/мес', 'mobile/мес', 'всего/мес', 'avg PC клики', 'avg mobile клики', 'CTR PC %', 'CTR mobile %', 'глубина рекламы', 'конкуренция', 'seed?']
    const seedRow: KeywordStat | undefined = searchVolume.relatedTopN.find(() => false) // placeholder, seed строится отдельно
    void seedRow
    const allRows: KeywordStat[] = [
      // seed row first
      {
        keyword: searchVolume.seedKeyword,
        monthlyPc: 0,
        monthlyMobile: 0,
        monthlyTotal: searchVolume.seedMonthlyTotal,
        avgPcClicks: 0,
        avgMobileClicks: 0,
        ctrPc: 0,
        ctrMobile: 0,
        adDepth: searchVolume.seedAdDepth,
        competition: searchVolume.seedCompetition,
        isSeed: true,
      },
      ...searchVolume.relatedTopN,
    ]
    const svRows: (string | number)[][] = [
      svHeaders,
      ...allRows.map((k) => [
        k.keyword,
        k.monthlyPc === -1 ? '<10' : k.monthlyPc,
        k.monthlyMobile === -1 ? '<10' : k.monthlyMobile,
        k.monthlyTotal,
        k.avgPcClicks,
        k.avgMobileClicks,
        k.ctrPc,
        k.ctrMobile,
        k.adDepth,
        k.competition,
        k.isSeed ? 'Y' : '',
      ]),
    ]
    await writeRows(sheets, spreadsheetId, svTab, svRows)
    await applyFormatting(sheets, spreadsheetId, svSheetId, { headerCols: svHeaders.length })
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateDimensionProperties: {
              range: { sheetId: svSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
              properties: { pixelSize: 240 },
              fields: 'pixelSize',
            },
          },
        ],
      },
    })
    writtenTabs.push(svTab)
  }

  // 8) COUPANG TAGS — агрегированные хэштеги от Coupang
  if (tags.length) {
    const tagsAgg = new Map<string, number>()
    for (const t of tags) tagsAgg.set(t.tag, (tagsAgg.get(t.tag) ?? 0) + t.count)
    const tagsSorted = [...tagsAgg.entries()].sort((a, b) => b[1] - a[1])
    const tagsTab = `${baseName}__coupang_tags`
    const tagsSheetId = await ensureSheet(sheets, spreadsheetId, tagsTab)
    const tagsRows: (string | number)[][] = [['тег', 'суммарно по всем товарам'], ...tagsSorted]
    await writeRows(sheets, spreadsheetId, tagsTab, tagsRows)
    await applyFormatting(sheets, spreadsheetId, tagsSheetId, { headerCols: 2 })
    writtenTabs.push(tagsTab)
  }

  return {
    tabs: writtenTabs,
    verdict,
  }
}
