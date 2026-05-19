import Anthropic from '@anthropic-ai/sdk'
import { google, sheets_v4 } from 'googleapis'
import type { Review } from './sheets-analysis'

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
}

export interface AIAnalysis {
  pains: AnalysisItem[]
  positives: AnalysisItem[]
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

export async function analyzeReviewsAI(reviews: Review[], keyword: string): Promise<AIAnalysis> {
  if (!reviews.length) return { pains: [], positives: [] }

  const sample = pickReviews(reviews)
  const reviewsText = formatReviewsForPrompt(sample)

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `Ты анализируешь корейские отзывы покупателей с Coupang о товарах в нише "${keyword}".

ЗАДАЧА: найти ПОВТОРЯЮЩИЕСЯ темы — что чаще всего жалуются (pains) и за что чаще всего хвалят (positives). Группируй похожие жалобы/похвалы в одну тему. Для каждой темы подсчитай примерное количество отзывов и приведи 1-3 короткие цитаты (можно перевести на русский).

ФОРМАТ ОТВЕТА — строго JSON, без markdown:
{
  "pains": [
    { "topic": "Краткое название боли на русском (3-6 слов)", "count": число, "quotes": ["цитата1", "цитата2"] }
  ],
  "positives": [
    { "topic": "Краткое название похвалы на русском (3-6 слов)", "count": число, "quotes": ["цитата1", "цитата2"] }
  ]
}

Сортируй по убыванию count. Минимум 5, максимум 15 тем в каждой категории.

ОТЗЫВЫ (${sample.length} шт):
${reviewsText}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  // Extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude не вернул JSON: ' + text.slice(0, 200))
  const parsed = JSON.parse(jsonMatch[0]) as AIAnalysis
  return {
    pains: Array.isArray(parsed.pains) ? parsed.pains : [],
    positives: Array.isArray(parsed.positives) ? parsed.positives : [],
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
  return [painsTab, positivesTab]
}
