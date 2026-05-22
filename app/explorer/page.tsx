'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const SHEET_ID = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID ?? ''
const STALE_DAYS = 7

interface RunListItem {
  id: string
  keyword: string
  scrapedAt: string
  verdictLevel: string
  verdictText: string
  reviewCount: number
  productCount: number
}

interface QueueItem {
  id: string
  runId: string
  keyword: string
  createdAt: string
  reason: string | null
  suggestedSheetName: string
  prevVerdict: string | null
  prevScrapedAt: string | null
  prevReviewCount: number | null
  prevProductCount: number | null
}

interface PreviewData {
  id: string
  keyword: string
  verdictText: string
  productCount: number
  reviewCount: number
  medianPrice: number
  photos: string[]
  photoSource: 'reviews' | 'listings'
  topPain: { topic: string; count: number } | null
  topPositive: { topic: string; count: number } | null
}

function buildScript(keyword: string, limit: number, sheetId: string, sheetName: string) {
  const tab = sheetName.trim() || `${keyword.trim()}_${new Date().toISOString().slice(0, 10)}`
  return `(async () => {
  const SHEET_ID = ${JSON.stringify(sheetId)};
  const KEYWORD = ${JSON.stringify(keyword)};
  const LIMIT = ${limit};
  const TAB_NAME = ${JSON.stringify(tab)};
  const API = 'http://localhost:3000/api/explorer/full';

  const log = (...a) => console.log('%c[oe]', 'color:#0ff', ...a);
  const err = (...a) => console.error('%c[oe]', 'color:#f55', ...a);

  const tfetch = async (url, ms = 12000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try { return await fetch(url, { credentials: 'include', signal: ctrl.signal }); }
    finally { clearTimeout(t); }
  };
  const tfetchJson = async (url) => {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await tfetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }
    throw lastErr;
  };

  // ========== Балансировка JSON-массива (для productList:[...]) ==========
  function sliceArray(s, i) {
    while (i < s.length && s[i] !== '[') i++;
    if (s[i] !== '[') return null;
    let d = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\\\') esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '[') d++;
        else if (c === ']') { d--; if (d === 0) return s.slice(i, j + 1); }
      }
    }
    return null;
  }

  // ========== Базовый URL: берём со страницы где запущен скрипт ==========
  // Это позволяет работать и на поиске /np/search?q=..., и на категории /np/categories/...,
  // и на фильтрованном листинге — везде где есть пагинация ?page=N
  const baseLoc = new URL(window.location.href);
  baseLoc.searchParams.delete('page');
  const basePath = baseLoc.pathname;
  const baseQuery = baseLoc.search; // включает '?' если параметры есть
  const sep = baseQuery ? '&' : '?';
  log('базовый URL для парса:', basePath + baseQuery);
  if (!/\\/np\\/(search|categories|brandshop)/.test(basePath)) {
    err('Похоже скрипт запущен НЕ на странице со списком товаров.');
    err('Открой /np/search?q=... ИЛИ /np/categories/{id} ИЛИ /np/brandshop/...');
    return;
  }

  // ========== Этапы 1+3: ID товаров + полные карточки из RSC-payload ==========
  // Coupang отдаёт SDW-виджеты: каждый виджет содержит productList:[ {index:{...}, link, priceArea, reviewArea, ...} ]
  // Собираем ВСЕ productList со страницы (основная выдача + aging + рекомендации) и дедуплицируем
  const ids = [];
  const ranks = {};
  const seen = new Set();
  const rawItems = [];
  let globalRank = 0;
  for (let pageNum = 1; pageNum <= 10 && ids.length < LIMIT; pageNum++) {
    log(\`страница \${pageNum}\`);
    let html;
    try {
      const r = await tfetch(\`\${basePath}\${baseQuery}\${sep}page=\${pageNum}\`);
      html = await r.text();
    } catch (e) { err('page ' + pageNum + ' failed', e); continue; }
    // Распаковка RSC
    let T = '';
    const pushRe = /__next_f\\.push\\(\\[1,"((?:[^"\\\\]|\\\\.)*)"\\]\\)/g;
    let pm;
    while ((pm = pushRe.exec(html))) {
      try { T += JSON.parse('"' + pm[1] + '"'); } catch (_) {}
    }
    // Извлекаем все productList:[...] массивы
    const plRe = /"productList":/g;
    let pageAdded = 0, listCount = 0, listSizes = [];
    let lm;
    while ((lm = plRe.exec(T))) {
      const arrStr = sliceArray(T, lm.index + 14);
      if (!arrStr) continue;
      let arr; try { arr = JSON.parse(arrStr); } catch (_) { continue; }
      if (!Array.isArray(arr)) continue;
      listCount++;
      listSizes.push(arr.length);
      for (const it of arr) {
        const idx = it.index || {};
        const pid = String(idx.legacyProductId?.legacyProductId ?? it.legacyProductId ?? '');
        if (!pid || pid === '0' || seen.has(pid)) continue;
        // Только товары (не баннеры/рекламные блоки без index)
        if (!idx.title && !idx.productTitle) continue;
        seen.add(pid);
        globalRank++;
        ranks[pid] = globalRank;
        ids.push(pid);
        rawItems.push(it);
        pageAdded++;
        if (ids.length >= LIMIT) break;
      }
      if (ids.length >= LIMIT) break;
    }

    // ========== DOM-fallback: догоняем productId которых нет в RSC ==========
    // RSC отдаёт только Rocket-сегмент (~15 шт). Остальное (seller-shipped, WOW и др.) рендерится в HTML.
    // Берём якоря <a href="/vp/products/{id}"> прямо из HTML, дедупим с уже собранными.
    let domAdded = 0, domSkipped = 0;
    try {
      const dom = new DOMParser().parseFromString(html, 'text/html');
      const anchors = Array.from(dom.querySelectorAll('a[href*="/vp/products/"]'));
      for (const a of anchors) {
        if (ids.length >= LIMIT) break;
        const href = a.getAttribute('href') || '';
        const m = href.match(/\\/vp\\/products\\/(\\d+)/);
        if (!m) continue;
        const pid = m[1];
        if (!pid || pid === '0' || seen.has(pid)) { domSkipped++; continue; }
        // Поднимаемся к карточке <li> (иногда div)
        const card = a.closest('li') || a.closest('div[id^="product"]') || a.parentElement;
        if (!card) continue;
        const img = card.querySelector('img');
        let title = (img?.getAttribute('alt') || a.textContent || '').trim();
        let imgUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || img?.getAttribute('data-img-src') || '';
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        const text = (card.textContent || '').replace(/\\s+/g, ' ');
        // Цена: первое число с '원'. priceMatch[1] = '15,280' → 15280
        let price = 0, originalPrice = 0, discountPct = 0;
        const prices = Array.from(text.matchAll(/([\\d,]{2,})\\s*원/g)).map(x => Number(x[1].replace(/,/g, ''))).filter(n => n > 100);
        if (prices.length) {
          price = Math.min(...prices);
          originalPrice = Math.max(...prices);
        }
        const discMatch = text.match(/(\\d{1,2})\\s*%/);
        if (discMatch) discountPct = Number(discMatch[1]);
        // Рейтинг и количество отзывов — точные числа достанем позже из /next-api/review
        // Флаги
        const isRocket = /로켓배송|로켓프레시|Rocket/.test(text) || !!card.querySelector('img[alt*="로켓"]');
        const isWow = /와우|WOW/i.test(text);
        const itemIdMatch = href.match(/itemId=(\\d+)/);
        const itemId = itemIdMatch ? itemIdMatch[1] : '';
        const isAd = /광고|AD/.test(text.slice(0, 100)) || !!card.querySelector('[class*="ad" i]');
        if (!title) continue;
        seen.add(pid);
        globalRank++;
        ranks[pid] = globalRank;
        ids.push(pid);
        rawItems.push({
          __dom: true,
          productId: pid,
          itemId,
          title,
          imgUrl,
          price,
          originalPrice: originalPrice > price ? originalPrice : price,
          discountPct,
          isRocket,
          isWow,
          isAd,
          href: href.startsWith('http') ? href : 'https://www.coupang.com' + href,
        });
        domAdded++;
      }
    } catch (e) { err('DOM-fallback ошибка:', String(e?.message ?? e)); }

    log(\`страница \${pageNum}: \${listCount} виджетов [\${listSizes.join(',')}], +\${pageAdded} RSC, +\${domAdded} DOM (всего \${ids.length})\`);
    if (ids.length >= LIMIT) break;
    await new Promise(r => setTimeout(r, 500));
  }
  log(\`найдено productId: \${ids.length}\`, ids);
  if (!ids.length) { err('Нет productId на странице. Проверь что ты на /np/search, /np/categories или /np/brandshop с видимыми товарами.'); return; }

  // ========== Этап 2: отзывы (с фото) ==========
  const reviews = [];
  for (let i = 0; i < ids.length; i++) {
    const pid = ids[i];
    try {
      const fd = await tfetchJson(\`/next-api/review?productId=\${pid}&page=1&size=20&sortBy=ORDER_SCORE_ASC&ratingSummary=true\`);
      const paging = fd?.rData?.paging;
      if (!paging) { err(\`[\${i+1}/\${ids.length}] \${pid} — нет paging\`); await new Promise(r => setTimeout(r, 2000)); continue; }
      const totalPage = Math.min(paging.totalPage ?? 1, 6);
      const before = reviews.length;
      const extractPhotos = (r) => {
        const candidates = [r.attachmentImages, r.images, r.reviewImages, r.photos]
          .filter(Array.isArray).flat();
        const urls = [];
        for (const img of candidates) {
          if (!img) continue;
          if (typeof img === 'string') urls.push(img);
          else if (img.url) urls.push(img.url);
          else if (img.imageUrl) urls.push(img.imageUrl);
          else if (img.src) urls.push(img.src);
          else if (img.originalSizeUrl) urls.push(img.originalSizeUrl);
        }
        return urls.map(u => u.startsWith('//') ? 'https:' + u : u);
      };
      const collect = (contents = []) => {
        for (const r of contents) reviews.push({
          productId: pid,
          productName: String(r.itemName ?? ''),
          reviewId: r.reviewId ?? '',
          rating: Number(r.rating ?? 0),
          date: r.reviewAt ? new Date(Number(r.reviewAt)).toISOString().slice(0,10) : '',
          reviewer: String(r.displayName ?? ''),
          helpful: Number(r.helpfulTrueCount ?? 0),
          title: String(r.title ?? ''),
          content: String(r.content ?? ''),
          photos: extractPhotos(r),
        });
      };
      collect(paging.contents);
      let pageErrors = 0;
      for (let p = 2; p <= totalPage; p++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const d = await tfetchJson(\`/next-api/review?productId=\${pid}&page=\${p}&size=20&sortBy=ORDER_SCORE_ASC\`);
          collect(d?.rData?.paging?.contents);
        } catch (e) {
          pageErrors++;
          if (pageErrors >= 3) { err('  ' + pid + ' p=' + p + ' — 3 ошибки подряд, дальше пропуск'); break; }
        }
      }
      const added = reviews.length - before;
      const name = reviews[before]?.productName ?? '';
      const photoCount = reviews.slice(before).reduce((s, r) => s + (r.photos?.length || 0), 0);
      log(\`[\${i+1}/\${ids.length}] \${pid} +\${added} отзывов, +\${photoCount} фото — \${name}\`);
    } catch (e) {
      err(\`[\${i+1}/\${ids.length}] \${pid} — ошибка\`, String(e?.message ?? e));
    }
    await new Promise(r => setTimeout(r, 4500));
  }
  log(\`собрано отзывов: \${reviews.length}\`);

  // ========== Этап 3: маппинг RSC-объектов в карточки ==========
  log('маппинг карточек из RSC...');
  const products = [];
  const tags = []; // RSC не содержит хэштеги «이런 점이 좋아요» — оставляем пустым
  // Считаем рейтинг/кол-во отзывов для DOM-карточек из уже собранных reviews
  const reviewStats = {};
  for (const r of reviews) {
    const s = reviewStats[r.productId] || (reviewStats[r.productId] = { sum: 0, n: 0 });
    s.sum += r.rating; s.n++;
  }
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];

    // ===== DOM-карточка (упрощённая структура) =====
    if (it.__dom) {
      const rs = reviewStats[it.productId];
      const rating = rs && rs.n ? +(rs.sum / rs.n).toFixed(2) : 0;
      const reviewCount = rs?.n ?? 0;
      products.push({
        productId: it.productId,
        name: it.title,
        seoShort: '', seoLong: '',
        price: it.price, originalPrice: it.originalPrice, discountPct: it.discountPct, couponDiscount: 0,
        wowPrice: 0, finalPrice: it.price, clearingPrice: 0,
        currency: 'KRW',
        rating, reviewCount, ratingDetails: null,
        imageCount: it.imgUrl ? 1 : 0,
        firstImage: it.imgUrl,
        category: '',
        url: it.href,
        sku: '',
        availability: 'in_stock',
        isRocket: it.isRocket, isWow: it.isWow,
        recentBuyers: null,
        seller: '',
        topKeyword: '', isAd: it.isAd,
        newItem: false,
        salesCount: 0,
        itemId: it.itemId,
        searchRank: ranks[it.productId] ?? (i + 1),
      });
      log(\`товар [\${i+1}/\${rawItems.length}] \${it.productId} \${it.price}₩ ⭐\${rating || '—'} (\${reviewCount}) [DOM]\${it.isRocket ? ' [R]' : ''} — \${(it.title || '').slice(0, 40)}\`);
      continue;
    }

    // ===== RSC-карточка (полная структура) =====
    const idx = it.index || {};
    const pid = String(idx.legacyProductId?.legacyProductId ?? it.legacyProductId ?? '');
    const itemId = String(idx.legacyProductId?.itemId ?? idx.itemId ?? '');
    // Название
    const name = String(idx.productTitle ?? idx.title ?? '');
    const seoShort = '', seoLong = String(idx.alternativeTitle ?? '');
    // Цены: minPrice — финальная (с купоном), salesPrice — anchor (зачёркнутая), couponPrice — instant
    const price = Number(idx.minPrice ?? idx.couponPrice ?? idx.salesPrice ?? 0);
    const originalPrice = Number(idx.salesPrice ?? idx.originalPrice ?? price);
    const finalPrice = Number(idx.minPrice ?? price);
    const discountPct = Number(idx.discountRate ?? it.priceArea?.discountRate ?? 0);
    const couponDiscount = (idx.couponPrice && idx.minPrice) ? Math.max(0, Number(idx.couponPrice) - Number(idx.minPrice)) : 0;
    const wowPrice = 0; // нет в новой структуре
    const clearingPrice = 0;
    // Фото: imageAndTitleArea.defaultUrl уже готовый URL, нужен только https: префикс
    let firstImage = String(it.imageAndTitleArea?.defaultUrl ?? '');
    if (firstImage.startsWith('//')) firstImage = 'https:' + firstImage;
    else if (firstImage && !firstImage.startsWith('http')) firstImage = 'https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/' + firstImage;
    if (!firstImage && idx.imageUrl) firstImage = 'https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/' + idx.imageUrl;
    // Категория: только id (нет дерева в новой структуре)
    const breadcrumb = idx.categoryId ? ['cat_' + idx.categoryId] : [];
    // Рейтинг
    const rating = Number(it.reviewArea?.ratingAverage ?? idx.reviewRatingAverage ?? 0);
    const reviewCount = Number(it.reviewArea?.ratingCount ?? idx.reviewRatingCount ?? 0);
    const ratingDetails = null; // нет детализации по звёздам
    // Флаги
    const isRocket = !!idx.rocketDelivery;
    const isWow = !!idx.wowMember;
    const isAd = !!it.adBadgeArea?.sponsored || !!it.sponsored;
    const topKeyword = '';
    const url = it.link ? ('https://www.coupang.com' + it.link) : ('https://www.coupang.com/vp/products/' + pid + (itemId ? '?itemId=' + itemId : ''));
    const soldOut = !!it.soldoutArea?.soldout;
    products.push({
      productId: pid,
      name,
      seoShort, seoLong,
      price, originalPrice, discountPct, couponDiscount,
      wowPrice, finalPrice, clearingPrice,
      currency: 'KRW',
      rating, reviewCount, ratingDetails,
      imageCount: firstImage ? 1 : 0,
      firstImage,
      category: breadcrumb.join(' > '),
      url,
      sku: '',
      availability: soldOut ? 'out' : 'in_stock',
      isRocket, isWow,
      recentBuyers: idx.purchasedCount ?? null,
      seller: '',
      topKeyword, isAd,
      newItem: !!idx.hasNewItem,
      salesCount: 0,
      itemId,
      searchRank: ranks[pid] ?? (i + 1),
    });
    log(\`товар [\${i+1}/\${rawItems.length}] \${pid} \${price}₩ ⭐\${rating || '—'} (\${reviewCount}) \${isAd ? '[AD]' : ''}\${isRocket ? ' [R]' : ''} — \${(name || '').slice(0, 40)}\`);
  }
  log(\`собрано карточек: \${products.length}\`);

  // ========== Этап 4: Q&A (문의) ==========
  log('собираю Q&A...');
  const questions = [];
  // Только по топ-10 листингам — у остальных Q&A обычно пустое, экономим время
  const qaIds = ids.slice(0, Math.min(10, ids.length));
  const qaEndpoints = [
    pid => \`/next-api/inquiries?productId=\${pid}&page=1&size=20\`,
    pid => \`/next-api/qna?productId=\${pid}&page=1&size=20\`,
    pid => \`/vp/product/inquiries/\${pid}?pageNum=1&pageSize=20\`,
  ];
  for (let i = 0; i < qaIds.length; i++) {
    const pid = qaIds[i];
    let found = false;
    for (const ep of qaEndpoints) {
      try {
        const r = await tfetch(ep(pid));
        if (!r.ok) continue;
        const ctype = r.headers.get('content-type') || '';
        if (!ctype.includes('json')) continue;
        const d = await r.json();
        const list = d?.rData?.inquiries ?? d?.rData?.questions ?? d?.rData?.paging?.contents ?? d?.data?.list ?? [];
        if (!Array.isArray(list) || !list.length) continue;
        for (const q of list) {
          const question = String(q.question ?? q.contents ?? q.title ?? q.questionContent ?? '').trim();
          if (!question) continue;
          const answer = String(q.answer ?? q.answerContents ?? q.reply ?? '').trim();
          questions.push({
            productId: pid,
            questionId: String(q.id ?? q.inquiryId ?? q.questionId ?? ''),
            question,
            answer,
            askedAt: q.createdAt ? new Date(Number(q.createdAt) || q.createdAt).toISOString().slice(0,10) : '',
            answeredAt: q.answeredAt ? new Date(Number(q.answeredAt) || q.answeredAt).toISOString().slice(0,10) : '',
          });
        }
        found = true;
        break;
      } catch (e) { /* try next endpoint */ }
    }
    log(\`Q&A [\${i+1}/\${qaIds.length}] \${pid} — \${found ? 'ok' : 'нет данных'}\`);
    await new Promise(r => setTimeout(r, 600));
  }
  log(\`собрано вопросов: \${questions.length}\`);

  // ========== Сохранение в window ==========
  window.__oeData = { reviews, products, tags, questions };
  window.__oeMeta = { sheetId: SHEET_ID, sheetName: TAB_NAME, keyword: KEYWORD };
  window.__oeRetry = async () => {
    const r = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...window.__oeData,
        sheetId: window.__oeMeta.sheetId,
        sheetName: window.__oeMeta.sheetName,
        keyword: window.__oeMeta.keyword,
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + await r.text());
    const o = await r.json();
    console.log('%c[oe]', 'color:#0ff', '✓ записано:', o);
    showResult(o);
  };
  function showResult(o) {
    const lines = [];
    if (o.verdict) {
      lines.push(o.verdict.text);
      const m = o.verdict.metrics;
      lines.push('Листингов: ' + m.products + ', медиана цены: ' + Number(m.medianPrice).toLocaleString() + '₩');
      lines.push('Средний рейтинг: ' + m.avgRating + ', медиана отзывов: ' + m.medianReviewCount);
      lines.push('');
      for (const r of o.verdict.reasons) lines.push(r);
    }
    if (o.runId) {
      lines.push('');
      lines.push('Открыть explorer:');
      lines.push('http://localhost:3000/explorer/' + o.runId);
    }
    alert(lines.join('\\n'));
  }

  // ========== POST на сервер ==========
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviews, products, tags, questions, sheetId: SHEET_ID, sheetName: TAB_NAME, keyword: KEYWORD }),
    });
    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    const out = await res.json();
    log('✓ записано:', out);
    showResult(out);
  } catch (e) {
    err('POST на localhost не прошёл, скачиваю JSON:', e);
    const payload = { reviews, products, tags, questions, keyword: KEYWORD, sheetId: SHEET_ID, sheetName: TAB_NAME };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = TAB_NAME + '.json';
    a.click();
  }
})();`
}

export default function ScraperPage() {
  const router = useRouter()
  const [keyword, setKeyword] = useState('')
  const [limit, setLimit] = useState(20)
  const [sheetId, setSheetId] = useState(SHEET_ID)
  const [sheetName, setSheetName] = useState('')
  const [copied, setCopied] = useState(false)
  const [runs, setRuns] = useState<RunListItem[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueScanning, setQueueScanning] = useState(false)
  const [search, setSearch] = useState('')
  const [verdictFilter, setVerdictFilter] = useState<Set<string>>(new Set())
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null)
  const [previewCache, setPreviewCache] = useState<Record<string, PreviewData | 'loading' | 'error'>>({})

  useEffect(() => {
    fetch('/api/explorer/runs')
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false))

    fetch('/api/explorer/rerun-queue')
      .then((r) => r.json())
      .then((d) => setQueue(d.items ?? []))
      .catch(() => setQueue([]))
      .finally(() => setQueueLoading(false))

    // Pre-fill из query (?keyword=X&sheet=Y) — переход из баннера очереди
    const params = new URLSearchParams(window.location.search)
    const k = params.get('keyword')
    const s = params.get('sheet')
    if (k) setKeyword(k)
    if (s) setSheetName(s)
  }, [])

  const deleteRun = async (id: string) => {
    if (!confirm('Удалить прогон?')) return
    await fetch(`/api/explorer/runs?id=${id}`, { method: 'DELETE' })
    setRuns((rs) => rs.filter((r) => r.id !== id))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        if (next.size >= 4) {
          // вытесняем самый ранний выбранный
          const first = next.values().next().value
          if (first) next.delete(first)
        }
        next.add(id)
      }
      return next
    })
  }

  const compareSelected = () => {
    if (selected.size < 2) return
    const ids = [...selected]
    const params = ids.map((id, i) => `${String.fromCharCode(97 + i)}=${id}`).join('&')
    router.push(`/explorer/compare?${params}`)
  }

  const prefillFromQueue = (q: QueueItem) => {
    setKeyword(q.keyword)
    if (q.suggestedSheetName) setSheetName(q.suggestedSheetName)
    // прокручиваем к форме
    document.getElementById('explorer-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const dismissQueue = async (id: string) => {
    await fetch(`/api/explorer/rerun-queue?id=${id}`, { method: 'DELETE' })
    setQueue((q) => q.filter((x) => x.id !== id))
  }

  const rescanQueue = async () => {
    setQueueScanning(true)
    try {
      await fetch('/api/explorer/rerun-queue', { method: 'POST' })
      const fresh = await fetch('/api/explorer/rerun-queue').then((r) => r.json())
      setQueue(fresh.items ?? [])
    } finally {
      setQueueScanning(false)
    }
  }

  const toggleVerdict = (v: string) => {
    setVerdictFilter((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  const filteredRuns = runs.filter((r) => {
    if (verdictFilter.size > 0 && !verdictFilter.has(r.verdictLevel)) return false
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      if (!r.keyword.toLowerCase().includes(q)) return false
    }
    return true
  })

  const hoverRun = (id: string) => {
    setHoveredRunId(id)
    if (previewCache[id]) return
    setPreviewCache((c) => ({ ...c, [id]: 'loading' }))
    fetch(`/api/explorer/runs/${id}/preview`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: PreviewData) => setPreviewCache((c) => ({ ...c, [id]: d })))
      .catch(() => setPreviewCache((c) => ({ ...c, [id]: 'error' })))
  }

  const ageBadge = (scrapedAt: string) => {
    const days = Math.floor((Date.now() - new Date(scrapedAt).getTime()) / (1000 * 60 * 60 * 24))
    if (days < STALE_DAYS) return null
    return (
      <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
        {days}д
      </span>
    )
  }

  const script = buildScript(keyword || 'KEYWORD', limit, sheetId || 'SHEET_ID', sheetName)
  const canCopy = !!keyword.trim() && !!sheetId.trim()
  const searchUrl = keyword.trim()
    ? `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword.trim())}`
    : 'https://www.coupang.com/np/search?q=KEYWORD'

  const copy = async () => {
    await navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Opportunity Explorer</h1>
      <p className="text-slate-400 text-sm mb-6">
        Анализ конкурентов на Coupang: копируешь скрипт → вставляешь в DevTools на любой странице
        со списком товаров (<b>поиск</b>, <b>категория</b> или <b>бренд-шоп</b>) → в Google Sheets и БД летят
        отзывы, карточки, хэштеги и Q&amp;A с AI-разбором.
      </p>

      {!queueLoading && queue.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🔄</span>
            <h2 className="text-sm font-semibold text-amber-200">
              Готово к пересъёмке: {queue.length} {queue.length === 1 ? 'ниша' : 'ниш'}
            </h2>
            <span className="text-xs text-amber-300/60 ml-auto">
              MAYBE-прогоны старше {STALE_DAYS} дней — стоит пересмотреть динамику pains/цен/конкурентов
            </span>
          </div>
          <div className="space-y-1.5">
            {queue.map((q) => (
              <div key={q.id} className="flex items-center gap-3 bg-slate-900/60 rounded-lg px-3 py-2 text-sm">
                <span className="font-semibold text-slate-100 flex-1 truncate">{q.keyword}</span>
                <span className="text-xs text-slate-500 hidden md:inline">
                  {q.prevVerdict} · {q.prevReviewCount} отз. · {q.prevScrapedAt && new Date(q.prevScrapedAt).toLocaleDateString('ru-RU')}
                </span>
                <button
                  onClick={() => prefillFromQueue(q)}
                  className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 px-3 py-1 rounded transition-colors"
                  title={`Заполнить форму с keyword="${q.keyword}"${q.suggestedSheetName ? ` и sheetName="${q.suggestedSheetName}"` : ''}`}
                >
                  ↓ Заполнить форму
                </button>
                <Link
                  href={`/explorer/${q.runId}`}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  ← старый
                </Link>
                <button
                  onClick={() => dismissQueue(q.id)}
                  className="text-xs text-slate-500 hover:text-red-400 px-1"
                  title="Скрыть"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!runsLoading && runs.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2 flex-wrap">
            История прогонов
            <span className="text-xs text-slate-500 font-normal">
              ({filteredRuns.length}{filteredRuns.length !== runs.length ? `/${runs.length}` : ''})
            </span>
            <span className="text-xs text-slate-600 font-normal ml-auto">отметь до 4 — сравнить бок-о-бок</span>
            <Link
              href="/explorer/heatmap"
              className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors"
              title="Карта повторяющихся болей через все прогоны — найти market-wide gap"
            >
              🔥 Heatmap болей
            </Link>
            <button
              onClick={rescanQueue}
              disabled={queueScanning}
              className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors disabled:opacity-50"
              title="Пересканировать MAYBE-прогоны и обновить очередь"
            >
              {queueScanning ? 'скан…' : '⟳ скан очереди'}
            </button>
          </h2>

          <div className="flex gap-2 mb-3 flex-wrap">
            <input
              type="text"
              placeholder="Поиск по keyword…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[160px] bg-slate-800 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            {(['GO', 'MAYBE', 'SKIP'] as const).map((v) => {
              const active = verdictFilter.has(v)
              const emoji = v === 'GO' ? '🟢' : v === 'MAYBE' ? '🟡' : '🔴'
              const activeColor =
                v === 'GO' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                : v === 'MAYBE' ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                : 'bg-red-500/20 text-red-200 border-red-500/40'
              return (
                <button
                  key={v}
                  onClick={() => toggleVerdict(v)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active ? activeColor : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {emoji} {v}
                </button>
              )
            })}
            {(search || verdictFilter.size > 0) && (
              <button
                onClick={() => { setSearch(''); setVerdictFilter(new Set()) }}
                className="text-xs text-slate-500 hover:text-slate-200 px-2"
              >
                сброс
              </button>
            )}
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filteredRuns.length === 0 && (
              <div className="text-sm text-slate-500 py-6 text-center">Ничего не нашлось</div>
            )}
            {filteredRuns.map((r) => {
              const emoji = r.verdictLevel === 'GO' ? '🟢' : r.verdictLevel === 'MAYBE' ? '🟡' : '🔴'
              const isSelected = selected.has(r.id)
              const isHovered = hoveredRunId === r.id
              const preview = previewCache[r.id]
              return (
                <div
                  key={r.id}
                  onMouseEnter={() => hoverRun(r.id)}
                  onMouseLeave={() => setHoveredRunId(null)}
                  className={`relative flex items-center gap-3 px-3 py-2 rounded group transition-colors ${
                    isSelected ? 'bg-cyan-500/10 border border-cyan-500/30' : 'hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(r.id)}
                    className="w-4 h-4 accent-cyan-500"
                    title="Выбрать для сравнения (макс 4)"
                  />
                  <span className="text-base">{emoji}</span>
                  <Link
                    href={`/explorer/${r.id}`}
                    className="flex-1 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 text-sm min-w-0"
                  >
                    <span className="font-semibold text-slate-100 truncate flex items-center gap-2">
                      {r.keyword || '—'}
                      {r.verdictLevel === 'MAYBE' && ageBadge(r.scrapedAt)}
                    </span>
                    <span className="text-slate-400 text-xs">{r.productCount} тов.</span>
                    <span className="text-slate-400 text-xs">{r.reviewCount} отз.</span>
                    <span className="text-slate-500 text-xs tabular-nums">
                      {new Date(r.scrapedAt).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </Link>
                  <button
                    onClick={() => deleteRun(r.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs px-2 transition-opacity"
                    title="Удалить"
                  >
                    ✕
                  </button>

                  {isHovered && preview && (
                    <RunPreviewCard preview={preview} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 bg-slate-900 border border-cyan-500/40 rounded-full shadow-xl px-5 py-2.5 flex items-center gap-4">
          <span className="text-sm text-slate-300">
            Выбрано: <strong className="text-cyan-300">{selected.size}</strong>
            <span className="text-slate-500"> / 2-4</span>
          </span>
          <button
            onClick={compareSelected}
            disabled={selected.size < 2}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-1.5 rounded-full font-medium transition-colors"
          >
            Сравнить →
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-slate-500 hover:text-slate-300 text-xs"
          >
            сбросить
          </button>
        </div>
      )}

      <div id="explorer-form" className="bg-slate-900 rounded-xl p-6 space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Название прогона <span className="text-slate-600">(для истории и тегов)</span>
            </label>
            <input
              className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="캠핑 해먹"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Кол-во листингов <span className="text-slate-600">(1–100)</span>
            </label>
            <input
              type="number"
              className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              min={1} max={100}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Google Sheet ID</label>
            <input
              className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
              value={sheetId}
              onChange={e => setSheetId(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Название таба (необязательно)</label>
            <input
              className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder={`${keyword || 'keyword'}_${new Date().toISOString().slice(0, 10)}`}
              value={sheetName}
              onChange={e => setSheetName(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4">Как запустить</h2>
        <ol className="space-y-3 text-sm text-slate-300">
          <li className="flex gap-3">
            <span className="bg-cyan-600 text-white rounded-full w-6 h-6 shrink-0 flex items-center justify-center text-xs font-bold">1</span>
            <div>
              Открой в своём браузере <b>нужную страницу со списком товаров</b> на Coupang:
              <ul className="mt-1.5 ml-1 text-xs text-slate-400 space-y-0.5">
                <li>• <b>Поиск:</b> <a href={searchUrl} target="_blank" rel="noopener" className="text-cyan-400 underline break-all">{searchUrl}</a></li>
                <li>• <b>Категория:</b> например <span className="text-slate-300">쿠팡 홈 → 스포츠/레저 → 캠핑전문관 → 침낭/매트/해먹 → 해먹</span> (URL вида <span className="font-mono text-slate-400">/np/categories/186764</span>)</li>
                <li>• <b>Бренд-шоп / фильтрованный список</b> — тоже работает</li>
              </ul>
              <div className="text-xs text-amber-300/80 mt-1.5">
                💡 Для чистой ниши лучше использовать <b>категорию</b>, а не поиск — иначе попадёт мусор из соседних ниш
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="bg-cyan-600 text-white rounded-full w-6 h-6 shrink-0 flex items-center justify-center text-xs font-bold">2</span>
            <div>Нажми <kbd className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-xs">F12</kbd> → вкладка <b>Console</b></div>
          </li>
          <li className="flex gap-3">
            <span className="bg-cyan-600 text-white rounded-full w-6 h-6 shrink-0 flex items-center justify-center text-xs font-bold">3</span>
            <div>
              Скопируй скрипт кнопкой ниже, вставь в консоль, нажми <kbd className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-xs">Enter</kbd>
              <div className="text-xs text-slate-500 mt-1">Первый раз Chrome попросит набрать "allow pasting" — набери и нажми Enter</div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="bg-cyan-600 text-white rounded-full w-6 h-6 shrink-0 flex items-center justify-center text-xs font-bold">4</span>
            <div>Жди — в конце alert «Готово! Записано N отзывов». Отзывы появятся в Google Sheet.</div>
          </li>
        </ol>
      </div>

      <div className="bg-slate-900 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Скрипт</h2>
          <button
            onClick={copy}
            disabled={!canCopy}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {copied ? '✓ Скопировано' : 'Копировать скрипт'}
          </button>
        </div>
        {!canCopy && (
          <div className="text-amber-400 text-xs mb-2">Заполни «Название прогона» и «Google Sheet ID»</div>
        )}
        <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-300 font-mono overflow-x-auto max-h-80 overflow-y-auto">
          {script}
        </pre>
      </div>
    </div>
  )
}

function RunPreviewCard({ preview }: { preview: PreviewData | 'loading' | 'error' }) {
  if (preview === 'loading') {
    return (
      <div className="absolute left-full top-0 ml-3 z-30 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 text-xs text-slate-500">
        загрузка…
      </div>
    )
  }
  if (preview === 'error') {
    return (
      <div className="absolute left-full top-0 ml-3 z-30 w-72 bg-slate-900 border border-red-500/40 rounded-lg shadow-xl p-3 text-xs text-red-300">
        не удалось загрузить превью
      </div>
    )
  }
  return (
    <div className="absolute left-full top-0 ml-3 z-30 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 space-y-2 pointer-events-none">
      <div className="grid grid-cols-3 gap-1">
        {preview.photos.length === 0 ? (
          <div className="col-span-3 h-20 bg-slate-800/50 rounded flex items-center justify-center text-[10px] text-slate-500">
            нет фото
          </div>
        ) : (
          preview.photos.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="w-full h-20 rounded object-cover bg-slate-800"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ))
        )}
      </div>
      {preview.photoSource === 'listings' && (
        <div className="text-[9px] text-slate-600">фото из карточек — отзывы без фото</div>
      )}
      <div className="flex gap-3 text-[10px] text-slate-400 tabular-nums">
        <span>~{preview.medianPrice.toLocaleString()}₩</span>
        <span>{preview.productCount} тов.</span>
        <span>{preview.reviewCount} отз.</span>
      </div>
      {preview.topPain && (
        <div className="text-[11px]">
          <span className="text-red-300/70">● боль:</span>{' '}
          <span className="text-slate-200">{preview.topPain.topic}</span>
          <span className="text-slate-500"> ×{preview.topPain.count}</span>
        </div>
      )}
      {preview.topPositive && (
        <div className="text-[11px]">
          <span className="text-emerald-300/70">● хвалят:</span>{' '}
          <span className="text-slate-200">{preview.topPositive.topic}</span>
          <span className="text-slate-500"> ×{preview.topPositive.count}</span>
        </div>
      )}
    </div>
  )
}
