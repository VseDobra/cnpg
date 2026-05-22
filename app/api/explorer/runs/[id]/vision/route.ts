import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 300

export interface VisionInsights {
  totalPhotosAnalyzed: number
  useCases: { context: string; share: string; description: string; count: number }[]
  commonDefects: { defect: string; severity: 'critical' | 'major' | 'minor'; mentions: number; description: string }[]
  photoOpportunities: { opportunity: string; why: string; priority: 'high' | 'medium' | 'low' }[]
  buyerProfile: string
  generatedAt: string
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не задан в .env.local' }, { status: 400 })
  }

  const run = await prisma.scraperRun.findUnique({
    where: { id },
    include: { reviews: true },
  })
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 })

  const allPhotos: { url: string; rating: number; content: string }[] = []
  for (const r of run.reviews) {
    let urls: string[] = []
    try { urls = JSON.parse(r.photos) } catch {}
    for (const u of urls.slice(0, 3)) {
      allPhotos.push({ url: u, rating: r.rating, content: r.content })
    }
  }
  if (allPhotos.length < 5) {
    return NextResponse.json(
      { error: `Слишком мало фото (${allPhotos.length}). Vision-анализу нужно минимум 5.` },
      { status: 400 },
    )
  }

  // Sample: balance negative and positive — 30 фото суммарно для модели
  const negs = allPhotos.filter((p) => p.rating <= 3).slice(0, 12)
  const poss = allPhotos.filter((p) => p.rating >= 4).slice(0, 18)
  const sample = [...negs, ...poss]

  // Build content blocks for Claude — images + context
  const content: Anthropic.MessageParam['content'] = [
    {
      type: 'text' as const,
      text: `Ты анализируешь фото из отзывов с Coupang о товаре в нише "${run.keyword}".

ЗАДАЧА: посмотреть на ${sample.length} фото покупателей (с оценкой) и извлечь:
1. РЕАЛЬНЫЕ СЦЕНАРИИ ИСПОЛЬЗОВАНИЯ (контексты) — где и как юзают (балкон, лес, дом, кемпинг, спальня, двор...)
2. ОБЩИЕ ДЕФЕКТЫ из негативных фото (брак, размер не такой, цвет обманул, плохое качество, разрыв)
3. ВОЗМОЖНОСТИ ДЛЯ ЛИСТИНГОВЫХ ФОТО — что есть у покупателей в фото, но НЕТ в стандартных продающих фото (lifestyle, реальные размеры, контексты, before/after)
4. ПРОФИЛЬ ТИПИЧНОГО ПОКУПАТЕЛЯ — кто этот человек, как он живёт

ОТВЕТ — строго JSON без markdown:
{
  "useCases": [
    { "context": "Краткое название сценария на русском", "share": "Доля: majority/large/niche", "description": "1-2 строки описания", "count": число фото с этим контекстом }
  ],
  "commonDefects": [
    { "defect": "Краткое название дефекта", "severity": "critical|major|minor", "mentions": число, "description": "Что именно видно на фото" }
  ],
  "photoOpportunities": [
    { "opportunity": "Что снимать для своего листинга", "why": "Какой сигнал из user-фото это закрывает", "priority": "high|medium|low" }
  ],
  "buyerProfile": "1 параграф — кто типичный покупатель"
}

ФОТО (в порядке: рейтинг покупателя, краткая суть его отзыва):`,
    },
  ]

  for (let i = 0; i < sample.length; i++) {
    const p = sample[i]
    content.push({
      type: 'text' as const,
      text: `\n#${i + 1} [⭐${p.rating}] ${p.content.slice(0, 120).replace(/\n/g, ' ')}`,
    })
    content.push({
      type: 'image' as const,
      source: { type: 'url' as const, url: p.url },
    })
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      messages: [{ role: 'user', content }],
    })
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude не вернул JSON: ' + text.slice(0, 300))
    const parsed = JSON.parse(jsonMatch[0]) as Partial<VisionInsights>

    const result: VisionInsights = {
      totalPhotosAnalyzed: sample.length,
      useCases: Array.isArray(parsed.useCases) ? parsed.useCases : [],
      commonDefects: Array.isArray(parsed.commonDefects) ? parsed.commonDefects : [],
      photoOpportunities: Array.isArray(parsed.photoOpportunities) ? parsed.photoOpportunities : [],
      buyerProfile: String(parsed.buyerProfile ?? ''),
      generatedAt: new Date().toISOString(),
    }

    await prisma.scraperRun.update({
      where: { id },
      data: { visionInsights: JSON.stringify(result) },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
