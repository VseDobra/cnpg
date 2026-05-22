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
    // Снимаем merge + conditional formatting со старой версии того же таба
    const requests: sheets_v4.Schema$Request[] = [
      { unmergeCells: { range: { sheetId: existing.properties.sheetId } } },
    ]
    try {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
    } catch {
      /* нечего разъединять — ок */
    }
    return existing.properties.sheetId
  }
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  })
  return res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
}

const RATING_COLORS = [
  { v: 1, c: { red: 0.95, green: 0.55, blue: 0.55 } },
  { v: 2, c: { red: 0.98, green: 0.75, blue: 0.6 } },
  { v: 3, c: { red: 1.0, green: 0.95, blue: 0.6 } },
  { v: 4, c: { red: 0.75, green: 0.95, blue: 0.75 } },
  { v: 5, c: { red: 0.55, green: 0.9, blue: 0.55 } },
]

interface Section {
  bannerRow: number
  headerRow: number
  headerCols: number
  dataStartRow: number
  dataEndRow: number
  ratingCol?: number
}

const MAX_COL = 16

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
  const m = verdict.metrics

  // ============ MAIN REPORT TAB ============
  const reportTab = baseName
  const reportSheetId = await ensureSheet(sheets, spreadsheetId, reportTab)

  const rows: (string | number)[][] = []
  const sections: Section[] = []

  // --- Header rows ---
  rows.push(['Ниша', data.keyword ?? ''])
  rows.push(['Дата', new Date().toISOString().slice(0, 10)])
  rows.push([])
  const verdictRow = rows.length
  rows.push([verdict.text])
  rows.push([])

  // --- Метрики ---
  let bannerRow = rows.length
  rows.push(['МЕТРИКИ'])
  let headerRow = rows.length
  rows.push(['Метрика', 'Значение'])
  let dataStart = rows.length
  rows.push(['Активных листингов', m.products])
  rows.push(['Уникальных продавцов', m.sellers])
  rows.push(['Медиана цены, ₩', m.medianPrice])
  rows.push(['Средний рейтинг', m.avgRating])
  rows.push(['Медиана отзывов на товар', m.medianReviewCount])
  rows.push(['Всего собрано отзывов', m.totalReviewsCollected])
  rows.push(['Доля негатива (1-2★), %', m.negativeShare])
  rows.push(['Концентрация ТОП-3, %', m.top3Concentration])
  rows.push(['Доля Rocket-доставки, %', m.rocketShare])
  if (searchVolume) {
    rows.push(['Naver: запросов/мес (seed)', searchVolume.seedMonthlyTotal])
    rows.push(['Naver: конкуренция (seed)', searchVolume.seedCompetition])
    rows.push(['Naver: глубина рекламы (seed)', searchVolume.seedAdDepth])
    rows.push(['Naver: связанных ключей', searchVolume.relatedCount])
    rows.push(['Naver: суммарный спрос экосистемы', searchVolume.totalEcosystemSearches])
  }
  sections.push({ bannerRow, headerRow, headerCols: 2, dataStartRow: dataStart, dataEndRow: rows.length })
  rows.push([])

  // --- Обоснование ---
  bannerRow = rows.length
  rows.push(['ОБОСНОВАНИЕ'])
  dataStart = rows.length
  for (const r of verdict.reasons) rows.push([r])
  sections.push({ bannerRow, headerRow: -1, headerCols: 1, dataStartRow: dataStart, dataEndRow: rows.length })
  rows.push([])

  // --- Товары ---
  bannerRow = rows.length
  rows.push([`ТОВАРЫ (${products.length})`])
  headerRow = rows.length
  const productsHeaders = ['productId', 'name', 'price', 'originalPrice', 'discountPct', 'couponDiscount', 'rating', 'reviewCount', 'imageCount', 'isRocket', 'isWow', 'recentBuyers', 'seller', 'category', 'firstImage', 'url']
  rows.push(productsHeaders)
  dataStart = rows.length
  for (const p of products) {
    rows.push([
      p.productId, p.name, p.price, p.originalPrice, p.discountPct, p.couponDiscount,
      p.rating, p.reviewCount, p.imageCount,
      p.isRocket ? 'Y' : 'N', p.isWow ? 'Y' : 'N',
      p.recentBuyers ?? '', p.seller, p.category, p.firstImage, p.url,
    ])
  }
  sections.push({ bannerRow, headerRow, headerCols: productsHeaders.length, dataStartRow: dataStart, dataEndRow: rows.length, ratingCol: 6 })
  rows.push([])

  // --- TOP-50 отзывов ---
  const topReviews = [...reviews].sort((a, b) => (b.helpful || 0) - (a.helpful || 0)).slice(0, 50)
  if (topReviews.length) {
    bannerRow = rows.length
    rows.push([`TOP-50 ОТЗЫВОВ (по helpful)`])
    headerRow = rows.length
    const reviewsHeaders = ['productId', 'productName', 'reviewId', 'rating', 'date', 'reviewer', 'helpful', 'title', 'content']
    rows.push(reviewsHeaders)
    dataStart = rows.length
    for (const r of topReviews) {
      rows.push([r.productId, r.productName, String(r.reviewId), r.rating, r.date, r.reviewer, r.helpful, r.title, r.content])
    }
    sections.push({ bannerRow, headerRow, headerCols: reviewsHeaders.length, dataStartRow: dataStart, dataEndRow: rows.length, ratingCol: 3 })
    rows.push([])
  }

  // --- Частые слова ---
  const wf = titleWordFrequency(products)
  if (wf.length) {
    bannerRow = rows.length
    rows.push([`ЧАСТЫЕ СЛОВА В НАЗВАНИЯХ (${wf.length})`])
    headerRow = rows.length
    rows.push(['слово', 'встречается'])
    dataStart = rows.length
    for (const [w, n] of wf) rows.push([w, n])
    sections.push({ bannerRow, headerRow, headerCols: 2, dataStartRow: dataStart, dataEndRow: rows.length })
    rows.push([])
  }

  // --- Q&A ---
  if (questions.length) {
    bannerRow = rows.length
    rows.push([`Q&A (${questions.length})`])
    headerRow = rows.length
    rows.push(['productId', 'askedAt', 'answeredAt', 'question', 'answer'])
    dataStart = rows.length
    for (const q of questions) rows.push([q.productId, q.askedAt ?? '', q.answeredAt ?? '', q.question, q.answer])
    sections.push({ bannerRow, headerRow, headerCols: 5, dataStartRow: dataStart, dataEndRow: rows.length })
    rows.push([])
  }

  // --- Хэштеги Coupang ---
  if (tags.length) {
    const tagsAgg = new Map<string, number>()
    for (const t of tags) tagsAgg.set(t.tag, (tagsAgg.get(t.tag) ?? 0) + t.count)
    const tagsSorted = [...tagsAgg.entries()].sort((a, b) => b[1] - a[1])
    bannerRow = rows.length
    rows.push([`ХЭШТЕГИ COUPANG (${tagsSorted.length})`])
    headerRow = rows.length
    rows.push(['тег', 'суммарно по всем товарам'])
    dataStart = rows.length
    for (const [t, n] of tagsSorted) rows.push([t, n])
    sections.push({ bannerRow, headerRow, headerCols: 2, dataStartRow: dataStart, dataEndRow: rows.length })
    rows.push([])
  }

  // --- Naver volume ---
  if (searchVolume && (searchVolume.seedMonthlyTotal > 0 || searchVolume.relatedTopN.length)) {
    const allRows: KeywordStat[] = [
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
    bannerRow = rows.length
    rows.push([`ПОИСКОВЫЙ ОБЪЁМ NAVER (${allRows.length} ключей)`])
    headerRow = rows.length
    rows.push(['ключевик', 'PC/мес', 'mobile/мес', 'всего/мес', 'avg PC клики', 'avg mobile клики', 'CTR PC %', 'CTR mobile %', 'глубина рекламы', 'конкуренция', 'seed?'])
    dataStart = rows.length
    for (const k of allRows) {
      rows.push([
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
      ])
    }
    sections.push({ bannerRow, headerRow, headerCols: 11, dataStartRow: dataStart, dataEndRow: rows.length })
    rows.push([])
  }

  // Write report rows in one call
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${reportTab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  })

  // Build formatting requests
  const requests: sheets_v4.Schema$Request[] = []

  // Column widths
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: reportSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 280 },
      fields: 'pixelSize',
    },
  })
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: reportSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
      properties: { pixelSize: 350 },
      fields: 'pixelSize',
    },
  })

  // Большой вердикт-баннер
  const verdictBg = verdict.level === 'GO'
    ? { red: 0.65, green: 0.9, blue: 0.65 }
    : verdict.level === 'MAYBE'
      ? { red: 1, green: 0.94, blue: 0.6 }
      : { red: 1, green: 0.65, blue: 0.65 }
  requests.push({
    mergeCells: {
      range: { sheetId: reportSheetId, startRowIndex: verdictRow, endRowIndex: verdictRow + 1, startColumnIndex: 0, endColumnIndex: MAX_COL },
      mergeType: 'MERGE_ALL',
    },
  })
  requests.push({
    repeatCell: {
      range: { sheetId: reportSheetId, startRowIndex: verdictRow, endRowIndex: verdictRow + 1, startColumnIndex: 0, endColumnIndex: MAX_COL },
      cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 18 }, backgroundColor: verdictBg, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment)',
    },
  })
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: reportSheetId, dimension: 'ROWS', startIndex: verdictRow, endIndex: verdictRow + 1 },
      properties: { pixelSize: 50 },
      fields: 'pixelSize',
    },
  })

  // Section banners + table headers + rating colors
  for (const s of sections) {
    requests.push({
      mergeCells: {
        range: { sheetId: reportSheetId, startRowIndex: s.bannerRow, endRowIndex: s.bannerRow + 1, startColumnIndex: 0, endColumnIndex: MAX_COL },
        mergeType: 'MERGE_ALL',
      },
    })
    requests.push({
      repeatCell: {
        range: { sheetId: reportSheetId, startRowIndex: s.bannerRow, endRowIndex: s.bannerRow + 1, startColumnIndex: 0, endColumnIndex: MAX_COL },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 } },
            backgroundColor: { red: 0.2, green: 0.25, blue: 0.32 },
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE',
            padding: { top: 4, bottom: 4, left: 8, right: 4 },
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,padding)',
      },
    })

    if (s.headerRow >= 0) {
      requests.push({
        repeatCell: {
          range: { sheetId: reportSheetId, startRowIndex: s.headerRow, endRowIndex: s.headerRow + 1, startColumnIndex: 0, endColumnIndex: s.headerCols },
          cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.92, green: 0.93, blue: 0.96 }, horizontalAlignment: 'CENTER' } },
          fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
        },
      })
    }

    if (s.ratingCol != null && s.dataEndRow > s.dataStartRow) {
      for (const { v, c } of RATING_COLORS) {
        requests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId: reportSheetId, startRowIndex: s.dataStartRow, endRowIndex: s.dataEndRow, startColumnIndex: s.ratingCol, endColumnIndex: s.ratingCol + 1 }],
              booleanRule: { condition: { type: 'NUMBER_EQ', values: [{ userEnteredValue: String(v) }] }, format: { backgroundColor: c } },
            },
            index: 0,
          },
        })
      }
    }
  }

  // Freeze шапки (ниша + дата + blank + вердикт + blank)
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: reportSheetId, gridProperties: { frozenRowCount: 5 } },
      fields: 'gridProperties.frozenRowCount',
    },
  })

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })

  // ============ FULL REVIEWS TAB ============
  const reviewsTab = `${baseName}__reviews_all`
  const reviewsSheetId = await ensureSheet(sheets, spreadsheetId, reviewsTab)
  const reviewsHeaders = ['productId', 'productName', 'reviewId', 'rating', 'date', 'reviewer', 'helpful', 'title', 'content']
  const reviewsRows: (string | number)[][] = [
    reviewsHeaders,
    ...reviews.map((r) => [r.productId, r.productName, String(r.reviewId), r.rating, r.date, r.reviewer, r.helpful, r.title, r.content]),
  ]
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${reviewsTab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: reviewsRows },
  })
  const reviewsRequests: sheets_v4.Schema$Request[] = [
    {
      repeatCell: {
        range: { sheetId: reviewsSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: reviewsHeaders.length },
        cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.2, green: 0.25, blue: 0.32 }, horizontalAlignment: 'CENTER' } },
        fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId: reviewsSheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      setBasicFilter: {
        filter: { range: { sheetId: reviewsSheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: reviewsHeaders.length } },
      },
    },
  ]
  for (const { v, c } of RATING_COLORS) {
    reviewsRequests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: reviewsSheetId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 }],
          booleanRule: { condition: { type: 'NUMBER_EQ', values: [{ userEnteredValue: String(v) }] }, format: { backgroundColor: c } },
        },
        index: 0,
      },
    })
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reviewsRequests } })

  // ============ удалить старые табы (8-табов-схема) того же baseName ============
  const oldSuffixes = ['__summary', '__products', '__reviews', '__top_reviews', '__titles', '__photos', '__qa', '__coupang_tags', '__search_volume']
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const deleteRequests: sheets_v4.Schema$Request[] = []
  for (const sh of meta.data.sheets ?? []) {
    const title = sh.properties?.title
    if (!title || sh.properties?.sheetId == null) continue
    if (oldSuffixes.some((suf) => title === baseName + suf)) {
      deleteRequests.push({ deleteSheet: { sheetId: sh.properties.sheetId } })
    }
  }
  if (deleteRequests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: deleteRequests } })
  }

  return {
    tabs: [reportTab, reviewsTab],
    verdict,
  }
}
