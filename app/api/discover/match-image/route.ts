import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { fetchShoppingResults } from '@/lib/naver/shopping'

export async function POST(req: NextRequest) {
  const { keyword, imageBase64, imageMediaType } = await req.json()
  if (!keyword || !imageBase64) {
    return NextResponse.json({ error: 'keyword and imageBase64 required' }, { status: 400 })
  }

  const products = await fetchShoppingResults(keyword, 5)
  const competitorTitles = products
    .map((p, i) => `${i + 1}. ${p.title.replace(/<[^>]+>/g, '')}`)
    .join('\n')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Ключевое слово поиска на Naver Shopping: "${keyword}"\n\nТоп товары в результатах:\n${competitorTitles}\n\nЭто фото товара, который хочу продавать:`,
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (imageMediaType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'Соответствует ли этот товар тому, что ищут по данному ключевому слову? Ответь строго в формате JSON без markdown: {"matches": true, "explanation": "1-2 предложения на русском"}',
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ matches: false, explanation: 'Не удалось проанализировать ответ' })
  }
  try {
    return NextResponse.json(JSON.parse(jsonMatch[0]))
  } catch {
    return NextResponse.json({ matches: false, explanation: 'Не удалось разобрать ответ Claude' })
  }
}
