import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 300

export interface ListingDraft {
  koreanTitle: string
  ruTranslationOfTitle: string
  bullets: { ko: string; ru: string; addresses: string }[]
  description: { ko: string; ru: string }
  pricingSuggestion: { recommended: number; reasoning: string }
  imagesChecklist: string[]
  positioning: string
  generatedAt: string
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не задан в .env.local' }, { status: 400 })
  }

  const run = await prisma.scraperRun.findUnique({
    where: { id },
    include: { products: true, topics: true, questions: true, tags: true },
  })
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 })

  const pains = run.topics
    .filter((t) => t.kind === 'pain')
    .slice(0, 10)
    .map((t) => ({ topic: t.topic, count: t.count }))
  const positives = run.topics
    .filter((t) => t.kind === 'positive')
    .slice(0, 10)
    .map((t) => ({ topic: t.topic, count: t.count }))
  const fears = run.topics
    .filter((t) => t.kind === 'fear')
    .slice(0, 8)
    .map((t) => ({ topic: t.topic, count: t.count }))
  const top3 = [...run.products]
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 3)
    .map((p) => ({ name: p.name, price: p.price, rating: p.rating, reviewCount: p.reviewCount }))

  const sortedPrices = run.products.map((p) => p.price).filter((p) => p > 0).sort((a, b) => a - b)
  const medPrice = sortedPrices[Math.floor(sortedPrices.length / 2)] || 0
  const p33 = sortedPrices[Math.floor(sortedPrices.length * 0.33)] || 0
  const p66 = sortedPrices[Math.floor(sortedPrices.length * 0.66)] || 0

  const topTags = run.tags
    .reduce((acc: Record<string, number>, t) => ((acc[t.tag] = (acc[t.tag] ?? 0) + t.count), acc), {})

  const topTagList = Object.entries(topTags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t, c]) => `${t} (×${c})`)

  const ext = run.aiExtended ? (JSON.parse(run.aiExtended) as Record<string, unknown>) : null

  const prompt = `Ты — senior product copywriter для корейского маркетплейса Coupang. Создай ДРАФТ ЛИСТИНГА для нового продавца, выходящего в нишу "${run.keyword}".

КОНТЕКСТ НИШИ:

ТОП-3 ЛИДЕРА:
${top3.map((p, i) => `${i + 1}. "${p.name.slice(0, 80)}" — ${p.price.toLocaleString()}₩, ⭐${p.rating}, ${p.reviewCount} отзывов`).join('\n')}

ЦЕНОВЫЕ ТИРЫ:
- Бюджет: ≤${p33.toLocaleString()}₩
- Средний: ${p33.toLocaleString()}–${p66.toLocaleString()}₩
- Премиум: ≥${p66.toLocaleString()}₩
- Медиана: ${medPrice.toLocaleString()}₩

БОЛЬ КЛИЕНТОВ (на что жалуются):
${pains.length ? pains.map((p) => `- ${p.topic} (×${p.count})`).join('\n') : '— нет данных'}

ЧТО ХВАЛЯТ:
${positives.length ? positives.map((p) => `- ${p.topic} (×${p.count})`).join('\n') : '— нет данных'}

СТРАХИ ДО ПОКУПКИ (из Q&A):
${fears.length ? fears.map((f) => `- ${f.topic} (×${f.count})`).join('\n') : '— нет данных'}

ХЭШТЕГИ COUPANG ("이런 점이 좋아요"):
${topTagList.length ? topTagList.join(', ') : '— нет'}

${ext ? `СТРАТЕГИЧЕСКИЕ ИНСАЙТЫ:\n${JSON.stringify(ext, null, 2).slice(0, 2000)}` : ''}

ЗАДАЧА: создай драфт листинга, который:
1. Имеет корейское название (max 50 символов) — обязательно с ключом "${run.keyword}", плюс УТП-дифференциатор
2. 5 буллетов на корейском — каждый ЗАКРЫВАЕТ конкретный pain ИЛИ pre-fear из данных выше
3. Описание (3-5 предложений) — позиционирование против слабостей топ-3
4. Цена — конкретное число в KRW, обоснованное (атаковать бюджет / встать в середину / встать выше с УСИЛИЯМИ)
5. Чеклист фото для листинга — 6-8 конкретных кадров (что снять, чтобы закрыть pre-fears и показать use cases)
6. Позиционирование одним предложением

ОТВЕТ строго JSON без markdown:
{
  "koreanTitle": "Корейское название",
  "ruTranslationOfTitle": "Перевод на русский",
  "bullets": [
    { "ko": "Корейский буллет", "ru": "Перевод", "addresses": "Какой pain/fear закрывает" }
  ],
  "description": {
    "ko": "Описание на корейском",
    "ru": "Перевод на русский"
  },
  "pricingSuggestion": {
    "recommended": число_в_KRW,
    "reasoning": "Почему именно эта цена — позиция в нише"
  },
  "imagesChecklist": [
    "Кадр 1: что снять и зачем",
    "Кадр 2: ..."
  ],
  "positioning": "Один параграф — кто целевой покупатель и чем мы отличаемся от топ-3"
}`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude не вернул JSON: ' + text.slice(0, 300))
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ListingDraft>

    const result: ListingDraft = {
      koreanTitle: String(parsed.koreanTitle ?? ''),
      ruTranslationOfTitle: String(parsed.ruTranslationOfTitle ?? ''),
      bullets: Array.isArray(parsed.bullets)
        ? parsed.bullets.map((b) => ({
            ko: String(b?.ko ?? ''),
            ru: String(b?.ru ?? ''),
            addresses: String(b?.addresses ?? ''),
          }))
        : [],
      description: {
        ko: String(parsed.description?.ko ?? ''),
        ru: String(parsed.description?.ru ?? ''),
      },
      pricingSuggestion: {
        recommended: Number(parsed.pricingSuggestion?.recommended ?? medPrice),
        reasoning: String(parsed.pricingSuggestion?.reasoning ?? ''),
      },
      imagesChecklist: Array.isArray(parsed.imagesChecklist) ? parsed.imagesChecklist.map(String) : [],
      positioning: String(parsed.positioning ?? ''),
      generatedAt: new Date().toISOString(),
    }

    await prisma.scraperRun.update({
      where: { id },
      data: { listingDraft: JSON.stringify(result) },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
