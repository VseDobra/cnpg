import { NextRequest } from 'next/server'
import { scrapeCoupang, type ProgressEvent } from '@/lib/scraper/coupang-pw'
import { writeReviewsToSheet } from '@/lib/google/sheets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

export async function POST(req: NextRequest) {
  const { keyword, limit, sheetId, sheetName } = await req.json()

  if (!keyword?.trim() || !sheetId?.trim()) {
    return new Response(JSON.stringify({ error: 'keyword and sheetId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const onProgress = (e: ProgressEvent) => send(e as unknown as Record<string, unknown>)

      try {
        const reviews = await scrapeCoupang(
          String(keyword).trim(),
          Math.min(Math.max(Number(limit) || 10, 1), 50),
          onProgress,
        )

        if (!reviews.length) {
          send({ type: 'error', message: 'Отзывы не найдены' })
          return
        }

        const tab =
          String(sheetName ?? '').trim() ||
          `${String(keyword).trim()}_${new Date().toISOString().slice(0, 10)}`
        send({ type: 'writing', count: reviews.length, sheet: tab })
        const result = await writeReviewsToSheet(String(sheetId).trim(), tab, reviews)
        send({ type: 'done', written: result.written, sheet: result.sheet })
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
