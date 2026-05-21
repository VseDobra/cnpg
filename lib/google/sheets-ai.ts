import Anthropic from '@anthropic-ai/sdk'
import { google, sheets_v4 } from 'googleapis'
import type { Review, Question } from './sheets-analysis'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export interface AnalysisItem {
  topic: string
  count: number
  quotes: string[]
  reviewIds?: string[] // which sample-index review IDs match this topic
}

export interface PreFear {
  topic: string
  count: number
  examples: string[]
}

export interface DriverItem {
  driver: string         // e.g. "Удобство сборки", "Качество ткани"
  importance: 'high' | 'medium' | 'low'
  evidence: string       // 1-2 строки объяснения с цитатой
  mentions: number
}

export interface ImprovementArea {
  area: string
  severity: 'critical' | 'major' | 'minor'
  evidence: string
  opportunity: string    // как этим можно отстроиться
  mentions: number
}

export interface ExpectationItem {
  expectation: string    // чего ждали
  reality: string        // что получили
  gap: 'positive' | 'negative' | 'neutral'  // оправдались/нет
  mentions: number
}

export interface DemographicSegment {
  segment: string        // "Бюджетники для кемпинга", "Семьи с детьми"
  share: 'majority' | 'large' | 'niche' // приблизительная доля
  signals: string[]      // сигналы из отзывов (контекст использования, бюджет, цель)
  needs: string[]        // что им важно
}

export interface PriceTier {
  tier: 'low' | 'mid' | 'high'
  priceRange: string     // "до 15.000₩"
  buyerProfile: string
  sentimentTone: string  // как пишут на этой ценовой полке
  mentions: number
}

export interface StrategicInsight {
  opportunity: string    // что делать продавцу
  rationale: string      // почему — на каких сигналах основано
  priority: 'high' | 'medium' | 'low'
}

export interface ExtendedAnalysis {
  positiveDrivers: DriverItem[]      // что реально драйвит покупки
  improvementAreas: ImprovementArea[] // куда можно отстроиться
  expectationEvolution: ExpectationItem[] // gap между ожиданием и реальностью
  demographics: DemographicSegment[]
  priceTiers: PriceTier[]
  strategicInsights: StrategicInsight[]
}

export interface AIAnalysis {
  pains: AnalysisItem[]
  positives: AnalysisItem[]
  preFears?: PreFear[] // pre-purchase concerns from Q&A
  extended?: ExtendedAnalysis | null
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

function pickReviews(reviews: Review[], maxNeg = 200, maxPos = 200): Review[] {
  const neg = reviews.filter((r) => r.rating <= 3)
  const pos = reviews.filter((r) => r.rating >= 4)
  const sortByHelpful = (a: Review, b: Review) => (b.helpful || 0) - (a.helpful || 0)
  const sampledNeg = neg.sort(sortByHelpful).slice(0, maxNeg)
  const sampledPos = pos.sort(sortByHelpful).slice(0, maxPos)
  return [...sampledNeg, ...sampledPos]
}

function formatReviewsForPrompt(reviews: Review[]): string {
  return reviews
    .map((r, i) => {
      const txt = `${r.title} ${r.content}`.replace(/\s+/g, ' ').trim().slice(0, 400)
      return `${i + 1}. [⭐${r.rating} | helpful=${r.helpful}] ${txt}`
    })
    .join('\n')
}

function formatQuestionsForPrompt(questions: Question[]): string {
  return questions
    .slice(0, 100)
    .map((q, i) => `${i + 1}. Q: ${q.question.slice(0, 200)} | A: ${(q.answer || '—').slice(0, 200)}`)
    .join('\n')
}

interface ProductPriceContext {
  name: string
  price: number
  rating: number
  reviewCount: number
}

export async function analyzeReviewsAI(
  reviews: Review[],
  keyword: string,
  questions: Question[] = [],
  products: ProductPriceContext[] = [],
): Promise<AIAnalysis> {
  if (!reviews.length) return { pains: [], positives: [], preFears: [], extended: null }

  const sample = pickReviews(reviews)
  const reviewsText = formatReviewsForPrompt(sample)
  const hasQA = questions.length > 0
  const questionsText = hasQA ? formatQuestionsForPrompt(questions) : ''

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `Ты анализируешь корейские отзывы покупателей с Coupang о товарах в нише "${keyword}".

ЗАДАЧА:
1. Найти ПОВТОРЯЮЩИЕСЯ темы из ОТЗЫВОВ — что жалуются (pains) и за что хвалят (positives).
   - Группируй похожие в одну тему.
   - Для каждой темы: count, 1-3 цитаты на русском, и массив reviewRefs — индексы отзывов (число до точки в списке отзывов, например 1, 12, 47) попадающих в тему. Максимум 20 индексов на тему.
2.${hasQA ? ' Найти ПРЕДПОКУПОЧНЫЕ СТРАХИ из Q&A — что покупатели спрашивают ДО покупки. Это барьеры к продаже — важнее post-purchase жалоб. Снимать их в листинге/картинках.' : ' Q&A не предоставлено — preFears пустой массив.'}

ФОРМАТ ОТВЕТА — строго JSON, без markdown:
{
  "pains": [
    { "topic": "Название боли на русском (3-6 слов)", "count": число, "quotes": ["цитата"], "reviewRefs": [1, 12, 47] }
  ],
  "positives": [
    { "topic": "Название похвалы на русском", "count": число, "quotes": ["цитата"], "reviewRefs": [3, 8] }
  ],
  "preFears": [
    { "topic": "О чём боятся ДО покупки", "count": число, "examples": ["суть вопроса 1"] }
  ]
}

Сортируй по убыванию count. Минимум 5, максимум 15 тем в pains/positives. preFears: 3-10 или пусто.

ОТЗЫВЫ (${sample.length} шт):
${reviewsText}
${hasQA ? `\nВОПРОСЫ ДО ПОКУПКИ (${Math.min(questions.length, 100)} шт):\n${questionsText}` : ''}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude не вернул JSON: ' + text.slice(0, 200))
  const parsed = JSON.parse(jsonMatch[0]) as {
    pains?: Array<AnalysisItem & { reviewRefs?: number[] }>
    positives?: Array<AnalysisItem & { reviewRefs?: number[] }>
    preFears?: PreFear[]
  }

  const mapRefs = (items: Array<AnalysisItem & { reviewRefs?: number[] }> | undefined): AnalysisItem[] => {
    if (!Array.isArray(items)) return []
    return items.map((it) => ({
      topic: String(it.topic ?? ''),
      count: Number(it.count ?? 0),
      quotes: Array.isArray(it.quotes) ? it.quotes.map(String) : [],
      reviewIds: Array.isArray(it.reviewRefs)
        ? it.reviewRefs
            .map((idx) => sample[Number(idx) - 1]?.reviewId)
            .filter((id) => id != null && id !== '')
            .map(String)
        : [],
    }))
  }

  // Extended analysis — best-effort, separate call (не валим всё если он упадёт)
  let extended: ExtendedAnalysis | null = null
  try {
    extended = await analyzeExtended(client, sample, keyword, questions, products)
  } catch (e) {
    console.error('[AI extended] failed:', e instanceof Error ? e.message : e)
  }

  return {
    pains: mapRefs(parsed.pains),
    positives: mapRefs(parsed.positives),
    preFears: Array.isArray(parsed.preFears)
      ? parsed.preFears.map((f) => ({
          topic: String(f.topic ?? ''),
          count: Number(f.count ?? 0),
          examples: Array.isArray(f.examples) ? f.examples.map(String) : [],
        }))
      : [],
    extended,
  }
}

async function analyzeExtended(
  client: Anthropic,
  sample: Review[],
  keyword: string,
  questions: Question[],
  products: ProductPriceContext[],
): Promise<ExtendedAnalysis> {
  const reviewsText = formatReviewsForPrompt(sample)
  const hasQA = questions.length > 0
  const questionsText = hasQA ? formatQuestionsForPrompt(questions) : ''
  const productsText = products.length
    ? products
        .slice(0, 30)
        .map((p, i) => `${i + 1}. ₩${p.price.toLocaleString()} | ⭐${p.rating} (${p.reviewCount} отзывов) | ${p.name.slice(0, 80)}`)
        .join('\n')
    : ''

  const prompt = `Ты — стратегический аналитик. Делаешь Amazon Niche-Insights-style разбор корейской ниши "${keyword}" на Coupang.

ОТВЕТЬ строго JSON, без markdown, по такой схеме:
{
  "positiveDrivers": [
    {
      "driver": "Краткое название драйвера покупки на русском",
      "importance": "high" | "medium" | "low",
      "evidence": "1-2 строки объяснения, опираясь на отзывы",
      "mentions": число
    }
  ],
  "improvementAreas": [
    {
      "area": "Краткая зона улучшения",
      "severity": "critical" | "major" | "minor",
      "evidence": "На что жалуются и насколько серьёзно",
      "opportunity": "Конкретно: как новому продавцу этим отстроиться (1 строка)",
      "mentions": число
    }
  ],
  "expectationEvolution": [
    {
      "expectation": "Чего покупатель ожидал перед покупкой",
      "reality": "Что получил на практике",
      "gap": "positive" | "negative" | "neutral",
      "mentions": число
    }
  ],
  "demographics": [
    {
      "segment": "Описание сегмента (например, 'Кемперы-выходного-дня', 'Семьи с детьми', 'Городские для отдыха на балконе')",
      "share": "majority" | "large" | "niche",
      "signals": ["Контексты использования из отзывов, по которым ты их определил"],
      "needs": ["Что им важно — 3-5 пунктов"]
    }
  ],
  "priceTiers": [
    {
      "tier": "low" | "mid" | "high",
      "priceRange": "Например '<15.000₩' или '15-40.000₩' — на основе данных о товарах",
      "buyerProfile": "Кто покупает на этой ценовой полке",
      "sentimentTone": "Как пишут отзывы (восторженно/прагматично/жалуются на…)",
      "mentions": число
    }
  ],
  "strategicInsights": [
    {
      "opportunity": "Что конкретно делать новому продавцу, чтобы выиграть в этой нише (1-2 строки, очень практично)",
      "rationale": "На каких сигналах из данных это основано",
      "priority": "high" | "medium" | "low"
    }
  ]
}

Требования:
- positiveDrivers: 4-8 пунктов, сортируй по importance потом mentions
- improvementAreas: 4-8 пунктов, сортируй по severity
- expectationEvolution: 3-6 пунктов
- demographics: 2-4 сегмента
- priceTiers: ровно 3 (low/mid/high) на основе товаров ниже
- strategicInsights: 4-6 РАЗЛИЧНЫХ практичных рекомендаций (позиционирование, картинки, USP, цена, сегмент). Без воды.

ТОВАРЫ В НИШЕ (с ценами и отзывами):
${productsText || '(не предоставлено — выводи tiers по упоминаниям цен в отзывах)'}

ОТЗЫВЫ (${sample.length} шт):
${reviewsText}
${hasQA ? `\nВОПРОСЫ ДО ПОКУПКИ (${Math.min(questions.length, 100)} шт):\n${questionsText}` : ''}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude (extended) не вернул JSON: ' + text.slice(0, 200))
  const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtendedAnalysis>

  return {
    positiveDrivers: Array.isArray(parsed.positiveDrivers) ? parsed.positiveDrivers : [],
    improvementAreas: Array.isArray(parsed.improvementAreas) ? parsed.improvementAreas : [],
    expectationEvolution: Array.isArray(parsed.expectationEvolution) ? parsed.expectationEvolution : [],
    demographics: Array.isArray(parsed.demographics) ? parsed.demographics : [],
    priceTiers: Array.isArray(parsed.priceTiers) ? parsed.priceTiers : [],
    strategicInsights: Array.isArray(parsed.strategicInsights) ? parsed.strategicInsights : [],
  }
}

export async function writeAIAnalysisToSheet(
  spreadsheetId: string,
  baseName: string,
  analysis: AIAnalysis,
): Promise<string[]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const writeTab = async (suffix: string, title: string, items: AnalysisItem[], headerColor: { red: number; green: number; blue: number }) => {
    const tab = `${baseName}__${suffix}`
    const sheetId = await ensureSheet(sheets, spreadsheetId, tab)
    const rows: (string | number)[][] = [
      [title, 'Кол-во', 'Цитаты'],
      ...items.map((it) => [it.topic, it.count, (it.quotes || []).join(' / ')]),
    ]
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    })
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: headerColor } },
              fields: 'userEnteredFormat(textFormat,backgroundColor)',
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
              properties: { pixelSize: 280 },
              fields: 'pixelSize',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
              properties: { pixelSize: 600 },
              fields: 'pixelSize',
            },
          },
        ],
      },
    })
    return tab
  }

  const painsTab = await writeTab('pains', 'Боль клиентов', analysis.pains, { red: 0.95, green: 0.6, blue: 0.6 })
  const positivesTab = await writeTab('positives', 'Что хвалят', analysis.positives, { red: 0.6, green: 0.9, blue: 0.6 })

  const tabs = [painsTab, positivesTab]

  if (analysis.preFears && analysis.preFears.length) {
    const fearsTab = `${baseName}__pre_fears`
    const sheetId = await ensureSheet(sheets, spreadsheetId, fearsTab)
    const rows: (string | number)[][] = [
      ['Страх до покупки', 'Кол-во', 'Примеры вопросов'],
      ...analysis.preFears.map((f) => [f.topic, f.count, f.examples.join(' / ')]),
    ]
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${fearsTab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    })
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 1.0, green: 0.85, blue: 0.5 } } },
              fields: 'userEnteredFormat(textFormat,backgroundColor)',
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
              properties: { pixelSize: 280 },
              fields: 'pixelSize',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
              properties: { pixelSize: 600 },
              fields: 'pixelSize',
            },
          },
        ],
      },
    })
    tabs.push(fearsTab)
  }

  // EXTENDED ANALYSIS — 6 новых табов
  if (analysis.extended) {
    const ext = analysis.extended
    const writeGenericTab = async (
      suffix: string,
      headers: string[],
      rows: (string | number)[][],
      headerColor: { red: number; green: number; blue: number },
    ) => {
      const tab = `${baseName}__${suffix}`
      const sheetId = await ensureSheet(sheets, spreadsheetId, tab)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers, ...rows] },
      })
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
                cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: headerColor } },
                fields: 'userEnteredFormat(textFormat,backgroundColor)',
              },
            },
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
              },
            },
            {
              updateDimensionProperties: {
                range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length },
                properties: { pixelSize: 240 },
                fields: 'pixelSize',
              },
            },
          ],
        },
      })
      return tab
    }

    if (ext.positiveDrivers.length) {
      tabs.push(await writeGenericTab(
        'positive_drivers',
        ['Драйвер покупки', 'Важность', 'Упоминаний', 'Обоснование'],
        ext.positiveDrivers.map((d) => [d.driver, d.importance, d.mentions, d.evidence]),
        { red: 0.55, green: 0.85, blue: 0.55 },
      ))
    }
    if (ext.improvementAreas.length) {
      tabs.push(await writeGenericTab(
        'improvement_areas',
        ['Зона улучшения', 'Серьёзность', 'Упоминаний', 'Обоснование', 'Как отстроиться'],
        ext.improvementAreas.map((a) => [a.area, a.severity, a.mentions, a.evidence, a.opportunity]),
        { red: 1.0, green: 0.7, blue: 0.5 },
      ))
    }
    if (ext.expectationEvolution.length) {
      tabs.push(await writeGenericTab(
        'expectation_evolution',
        ['Ожидание', 'Реальность', 'Совпало?', 'Упоминаний'],
        ext.expectationEvolution.map((e) => [e.expectation, e.reality, e.gap, e.mentions]),
        { red: 0.85, green: 0.85, blue: 0.95 },
      ))
    }
    if (ext.demographics.length) {
      tabs.push(await writeGenericTab(
        'demographics',
        ['Сегмент', 'Доля', 'Сигналы', 'Потребности'],
        ext.demographics.map((d) => [d.segment, d.share, d.signals.join('; '), d.needs.join('; ')]),
        { red: 0.85, green: 0.7, blue: 1.0 },
      ))
    }
    if (ext.priceTiers.length) {
      tabs.push(await writeGenericTab(
        'price_tiers',
        ['Полка', 'Диапазон цен', 'Кто покупает', 'Тон отзывов', 'Упоминаний'],
        ext.priceTiers.map((p) => [p.tier, p.priceRange, p.buyerProfile, p.sentimentTone, p.mentions]),
        { red: 1.0, green: 0.95, blue: 0.55 },
      ))
    }
    if (ext.strategicInsights.length) {
      tabs.push(await writeGenericTab(
        'strategic_insights',
        ['Возможность', 'Приоритет', 'Обоснование'],
        ext.strategicInsights.map((s) => [s.opportunity, s.priority, s.rationale]),
        { red: 0.55, green: 0.75, blue: 1.0 },
      ))
    }
  }

  return tabs
}
