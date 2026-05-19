import { NextRequest, NextResponse } from 'next/server'
import { writeReviewsToSheet, type ReviewRow } from '@/lib/google/sheets'

const ALLOWED_ORIGINS = new Set([
  'https://www.coupang.com',
  'https://m.coupang.com',
  'http://localhost:3000',
  'http://localhost:3001',
])

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '*'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get('origin'))
  const { reviews, sheetId, sheetName } = await req.json()

  if (!sheetId) return NextResponse.json({ error: 'sheetId required' }, { status: 400, headers })
  if (!reviews?.length) return NextResponse.json({ error: 'reviews array required' }, { status: 400, headers })

  const result = await writeReviewsToSheet(sheetId, sheetName ?? `reviews_${new Date().toISOString().slice(0, 10)}`, reviews as ReviewRow[])
  return NextResponse.json(result, { headers })
}
