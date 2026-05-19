// Запускается в DevTools Console на https://www.coupang.com/np/search?q=훌라후프
// Собирает первые N productId, тянет все их отзывы, POST-ит на localhost:3000/api/scrape/reviews.

(async () => {
  const SHEET_ID = '1yJniFdKSNUhgMls-zxIluBdhLqjEdx639XJHtLirjMA'
  const KEYWORD = '훌라후프'
  const LIMIT = 30
  const TAB_NAME = `${KEYWORD}_${new Date().toISOString().slice(0, 10)}`
  const API = 'http://localhost:3000/api/scrape/reviews'

  const log = (...a) => console.log('%c[scrape]', 'color:#0ff', ...a)
  const err = (...a) => console.error('%c[scrape]', 'color:#f55', ...a)

  // 1. productId со страниц поиска
  const ids = []
  const seen = new Set()
  for (let pageNum = 1; pageNum <= 5 && ids.length < LIMIT; pageNum++) {
    log(`страница поиска ${pageNum}`)
    const url = `/np/search?q=${encodeURIComponent(KEYWORD)}&page=${pageNum}`
    const r = await fetch(url, { credentials: 'include' })
    const html = await r.text()
    for (const m of html.matchAll(/\/vp\/products\/(\d+)/g)) {
      if (seen.has(m[1])) continue
      seen.add(m[1])
      ids.push(m[1])
      if (ids.length >= LIMIT) break
    }
    await new Promise(r => setTimeout(r, 500))
  }
  log(`найдено productId: ${ids.length}`, ids)
  if (!ids.length) { err('Нет productId. Открой эту вкладку: https://www.coupang.com/np/search?q=' + encodeURIComponent(KEYWORD)); return }

  // 2. отзывы
  const reviews = []
  for (let i = 0; i < ids.length; i++) {
    const pid = ids[i]
    try {
      const first = await fetch(
        `/next-api/review?productId=${pid}&page=1&size=20&sortBy=ORDER_SCORE_ASC&ratingSummary=true`,
        { credentials: 'include' }
      )
      const fd = await first.json()
      const paging = fd?.rData?.paging
      if (!paging) { err(`[${i + 1}/${ids.length}] ${pid} — нет paging`); continue }
      const totalPage = paging.totalPage ?? 1
      const before = reviews.length
      const collect = (contents = []) => {
        for (const r of contents) {
          reviews.push({
            productId: pid,
            productName: String(r.itemName ?? ''),
            reviewId: r.reviewId ?? '',
            rating: Number(r.rating ?? 0),
            date: r.reviewAt ? new Date(Number(r.reviewAt)).toISOString().slice(0, 10) : '',
            reviewer: String(r.displayName ?? ''),
            helpful: Number(r.helpfulTrueCount ?? 0),
            title: String(r.title ?? ''),
            content: String(r.content ?? ''),
          })
        }
      }
      collect(paging.contents)
      for (let p = 2; p <= totalPage; p++) {
        await new Promise(r => setTimeout(r, 350))
        const res = await fetch(
          `/next-api/review?productId=${pid}&page=${p}&size=20&sortBy=ORDER_SCORE_ASC`,
          { credentials: 'include' }
        )
        const d = await res.json()
        collect(d?.rData?.paging?.contents)
      }
      const added = reviews.length - before
      const name = reviews[before]?.productName ?? ''
      log(`[${i + 1}/${ids.length}] ${pid} +${added} (всего ${reviews.length}) — ${name}`)
    } catch (e) {
      err(`[${i + 1}/${ids.length}] ${pid} — ошибка`, e)
    }
    await new Promise(r => setTimeout(r, 400))
  }

  log(`собрано отзывов: ${reviews.length}`)
  window.__coupangReviews = reviews

  // 3. POST на localhost (fallback — скачать JSON)
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviews, sheetId: SHEET_ID, sheetName: TAB_NAME }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    const out = await res.json()
    log('✓ записано в Sheets:', out)
  } catch (e) {
    err('POST на localhost не прошёл, скачиваю JSON локально:', e)
    const blob = new Blob([JSON.stringify(reviews, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${TAB_NAME}.json`
    a.click()
    log('файл скачан — кинь его сюда, я залью вручную')
  }
})()
