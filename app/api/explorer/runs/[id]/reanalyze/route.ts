import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { analyzeReviewsAI } from '@/lib/google/sheets-ai'
import type { Review, Question } from '@/lib/google/sheets-analysis'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY не задан в .env.local. Получи ключ на console.anthropic.com → Settings → API Keys.' },
      { status: 400 },
    )
  }

  const run = await prisma.scraperRun.findUnique({
    where: { id },
    include: { reviews: true, questions: true, products: true },
  })
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 })
  if (run.reviews.length < 10) {
    return NextResponse.json(
      { error: `Слишком мало отзывов (${run.reviews.length}). Нужно минимум 10 для AI-разбора.` },
      { status: 400 },
    )
  }

  const reviews: Review[] = run.reviews.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    reviewId: r.reviewId,
    rating: r.rating,
    date: r.reviewedAt,
    reviewer: r.reviewer,
    helpful: r.helpful,
    title: r.title,
    content: r.content,
    photos: safeJson<string[]>(r.photos, []),
  }))

  const questions: Question[] = run.questions.map((q) => ({
    productId: q.productId,
    questionId: q.questionId,
    question: q.question,
    answer: q.answer,
    askedAt: q.askedAt ?? undefined,
    answeredAt: q.answeredAt ?? undefined,
  }))

  const productCtx = run.products.map((p) => ({
    name: p.name,
    price: p.price,
    rating: p.rating,
    reviewCount: p.reviewCount,
  }))

  try {
    const analysis = await analyzeReviewsAI(reviews, run.keyword, questions, productCtx)

    await prisma.scrapedTopic.deleteMany({ where: { runId: id } })

    const topicRows = [
      ...analysis.pains.map((p, idx) => ({
        runId: id,
        kind: 'pain',
        topic: p.topic,
        count: p.count,
        quotes: JSON.stringify(p.quotes ?? []),
        reviewIds: JSON.stringify(p.reviewIds ?? []),
        rank: idx,
      })),
      ...analysis.positives.map((p, idx) => ({
        runId: id,
        kind: 'positive',
        topic: p.topic,
        count: p.count,
        quotes: JSON.stringify(p.quotes ?? []),
        reviewIds: JSON.stringify(p.reviewIds ?? []),
        rank: idx,
      })),
      ...(analysis.preFears ?? []).map((f, idx) => ({
        runId: id,
        kind: 'fear',
        topic: f.topic,
        count: f.count,
        quotes: JSON.stringify(f.examples ?? []),
        reviewIds: '[]',
        rank: idx,
      })),
    ]
    if (topicRows.length) {
      await prisma.scrapedTopic.createMany({ data: topicRows })
    }

    await prisma.scraperRun.update({
      where: { id },
      data: { aiExtended: analysis.extended ? JSON.stringify(analysis.extended) : null },
    })

    return NextResponse.json({
      ok: true,
      pains: analysis.pains.length,
      positives: analysis.positives.length,
      preFears: analysis.preFears?.length ?? 0,
      hasExtended: !!analysis.extended,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
