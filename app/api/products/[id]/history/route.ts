import { NextRequest, NextResponse } from 'next/server'
import { fetchProductStatusHistory } from '@/lib/coupang/products'

// Build Korean strings from code points to be 100% immune to file encoding
const chr = (...codes: number[]) => codes.map(c => String.fromCodePoint(c)).join('')

const K = {
  seungIn:     chr(0xC2B9, 0xC778),                              // 승인
  wanlyo:      chr(0xC644, 0xB8CC),                              // 완료
  daegijung:   chr(0xB300, 0xAE30, 0xC911),                      // 대기중
  yocheong:    chr(0xC694, 0xCCAD),                              // 요청
  geobu:       chr(0xAC70, 0xBD80),                              // 거부
  bupun:       chr(0xBD80, 0xBD84),                              // 부분
  imsijeojang: chr(0xC784, 0xC2DC, 0xC800, 0xC7A5),              // 임시저장
  sagje:       chr(0xC0AD, 0xC81C),                              // 삭제
  geomsujung:  chr(0xAC80, 0xC218, 0xC911),                      // 검수중
  coupangSys:  chr(0xCFE0, 0xD321, 0x20, 0xC140, 0xB7EC, 0x20, 0xC2DC, 0xC2A4, 0xD15C), // 쿠팡 셀러 시스템
  coupangSys2: chr(0xCFE0, 0xD321, 0xC140, 0xB7EC, 0xC2DC, 0xC2A4, 0xD15C),             // 쿠팡셀러시스템
  yocheongHuDaegijung: chr(0xC694, 0xCCAD, 0x20, 0xD6C4, 0x20, 0xB300, 0xAE30, 0xC911), // 요청 후 대기중
}

const ENGLISH_MAP: Record<string, string> = {
  SAVED: 'Черновик',
  APPROVING: 'Ожидает одобрения',
  IN_REVIEW: 'На проверке',
  APPROVED: 'Одобрен',
  PARTIAL_APPROVED: 'Частично одобрен',
  DENIED: 'Отклонён',
  DELETED: 'Удалён',
}

function tr(s: string): string {
  if (!s) return s
  if (s.includes(K.imsijeojang)) return 'Черновик'
  if (s.includes(K.yocheongHuDaegijung)) return 'Ожидает одобрения'
  if (s.includes(K.seungIn + K.daegijung)) return 'Ожидает одобрения'
  if (s.includes(K.seungIn + K.wanlyo)) return 'Одобрен'
  if (s.includes(K.seungIn + K.yocheong)) return 'Запрос одобрения'
  if (s.includes(K.seungIn + K.geobu)) return 'Отклонён'
  if (s.includes(K.bupun + K.seungIn)) return 'Частично одобрен'
  if (s.includes(K.sagje)) return 'Удалён'
  if (s.includes(K.geomsujung)) return 'На проверке'
  return ENGLISH_MAP[s] ?? s
}

function trBy(s: string): string {
  if (!s) return s
  if (s.includes(K.coupangSys) || s.includes(K.coupangSys2)) return 'Coupang (система)'
  return s
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await fetchProductStatusHistory(id)
    return NextResponse.json(data.map(e => ({
      ...e,
      statusRu: tr(e.status),
      createdByRu: trBy(e.createdBy),
    })))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
