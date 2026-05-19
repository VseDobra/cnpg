import { google } from 'googleapis'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export interface ReviewRow {
  productId: string
  productName: string
  reviewId: number | string
  rating: number
  date: string
  reviewer: string
  helpful: number
  title: string
  content: string
}

const HEADERS = ['productId', 'productName', 'reviewId', 'rating', 'date', 'reviewer', 'helpful', 'title', 'content']

export async function writeReviewsToSheet(sheetId: string, sheetName: string, reviews: ReviewRow[]) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // Ensure sheet tab exists, create if not
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
  const existingSheet = meta.data.sheets?.find(s => s.properties?.title === sheetName)

  if (!existingSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    })
  }

  // Clear existing content
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1:Z`,
  })

  // Write headers + data
  const rows = [
    HEADERS,
    ...reviews.map(r => HEADERS.map(h => String((r as Record<string, unknown>)[h] ?? ''))),
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  })

  return { written: reviews.length, sheet: sheetName }
}
