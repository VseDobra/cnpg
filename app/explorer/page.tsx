'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const SHEET_ID = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID ?? ''

interface RunListItem {
  id: string
  keyword: string
  scrapedAt: string
  verdictLevel: string
  verdictText: string
  reviewCount: number
  productCount: number
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

  // ========== Балансировка скобок для извлечения JSON-объектов из RSC ==========
  function balancedSlice(text, anchorIdx) {
    let depth = 0, start = -1;
    for (let j = anchorIdx; j >= 0; j--) {
      const c = text[j];
      if (c === '}') depth++;
      else if (c === '{') { if (depth === 0) { start = j; break; } depth--; }
    }
    if (start < 0) return null;
    let d = 0, inStr = false, esc = false;
    for (let j = start; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\\\') esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) return text.slice(start, j + 1); }
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
    // Распаковка RSC — собираем тело каждой строки из __next_f.push([1,"..."])
    // Regex учитывает JSON-escape (\\\" внутри строки не закрывает её)
    let T = '';
    const pushRe = /__next_f\\.push\\(\\[1,"((?:[^"\\\\]|\\\\.)*)"\\]\\)/g;
    let pm;
    while ((pm = pushRe.exec(html))) {
      try { T += JSON.parse('"' + pm[1] + '"'); } catch (_) {}
    }
    // Поиск каждого item-объекта по якорю "divisionType":"GOODS"
    const itemRe = /"divisionType":"GOODS"/g;
    let am, pageAdded = 0;
    while ((am = itemRe.exec(T))) {
      const slice = balancedSlice(T, am.index);
      if (!slice) continue;
      let it; try { it = JSON.parse(slice); } catch (_) { continue; }
      const pid = String(it.id ?? '');
      if (!pid || pid === '0' || seen.has(pid)) continue;
      seen.add(pid);
      globalRank++;
      ranks[pid] = globalRank;
      ids.push(pid);
      rawItems.push(it);
      pageAdded++;
      if (ids.length >= LIMIT) break;
    }
    log(\`страница \${pageNum}: +\${pageAdded} карточек (всего \${ids.length})\`);
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
      const totalPage = Math.min(paging.totalPage ?? 1, 50);
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
        await new Promise(r => setTimeout(r, 350));
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
    await new Promise(r => setTimeout(r, 1500));
  }
  log(\`собрано отзывов: \${reviews.length}\`);

  // ========== Этап 3: маппинг RSC-объектов в карточки ==========
  log('маппинг карточек из RSC...');
  const products = [];
  const tags = []; // RSC не содержит хэштеги «이런 점이 좋아요» — оставляем пустым
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const pid = String(it.id);
    // Название: основное title; SEO-варианты в спец-атрибуте itemAttributes[id=2147483607]
    let name = String(it.title ?? '');
    let seoShort = '', seoLong = '';
    const seoAttr = (it.itemAttributes || []).find(a => a && a.id === 2147483607);
    if (seoAttr && seoAttr.value) {
      try {
        const seo = JSON.parse(seoAttr.value);
        seoShort = String(seo?.default?.len10_title ?? '');
        seoLong = String(seo?.default?.len20_title ?? '');
      } catch (_) {}
    }
    if (!name && seoLong) name = seoLong;
    // Цены из pricesByMemberStatus.NOT_MEMBER
    const prices = (it.pricesByMemberStatus && it.pricesByMemberStatus.NOT_MEMBER) || {};
    const price = Number(prices.SALES?.priceEx?.amount ?? prices.INSTANT_DISCOUNT?.priceEx?.amount ?? 0);
    const wowPrice = Number(prices.WOW_MEMBER_PRICE?.priceEx?.amount ?? 0);
    const finalPrice = Number(prices.FINAL_PRICE?.priceEx?.amount ?? 0);
    const originalPrice = Number(prices.ANCHOR_PRICE?.priceEx?.amount ?? prices.ORIGINAL?.priceEx?.amount ?? price);
    const discountPct = originalPrice > 0 && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : Number(prices.SALES?.discountRate ?? 0);
    const couponDiscount = Number(prices.DOWNLOAD_COUPON_DISCOUNT?.discountAmountEx?.amount ?? 0);
    const clearingPrice = Number(it.itemProfiling?.metrics?.['shared_item-clearing-price-amount_1'] ?? 0);
    // Фото: imagePath относительный → полный URL через CDN
    const firstImage = it.imagePath ? 'https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/' + it.imagePath : '';
    // Категория: разворачиваем kanCategory вверх по parentCategory
    const breadcrumb = [];
    let cat = it.kanCategory;
    while (cat) { if (cat.name) breadcrumb.unshift(cat.name); cat = cat.parentCategory; }
    // Рейтинг
    const rating = Number(it.ratingInfo?.ratingAverage ?? 0);
    const reviewCount = Number(it.ratingInfo?.ratingCount ?? 0);
    const ratingDetails = Array.isArray(it.ratingInfo?.ratingDetails) ? it.ratingInfo.ratingDetails : null;
    // Флаги
    const rocketTypes = Array.isArray(it.rocketWowTypes) ? it.rocketWowTypes : [];
    const isRocket = rocketTypes.length > 0;
    const isWow = rocketTypes.some(t => /WOW/i.test(String(t)));
    const isAd = !!it.logging?.byPassParamMap?.adsClickUrl;
    const topKeyword = String(it.itemProfiling?.metrics?.['shared_item-top-conversion-keyword_1'] ?? '');
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
      url: 'https://www.coupang.com/vp/products/' + pid + (it.itemId ? '?itemId=' + it.itemId : ''),
      sku: '',
      availability: it.soldOut ? 'out' : 'in_stock',
      isRocket, isWow,
      recentBuyers: it.oneYearPurchaseCount ?? null,
      seller: '',
      topKeyword, isAd,
      newItem: !!it.newItem,
      salesCount: Number(it.salesCount ?? 0),
      itemId: String(it.itemId ?? ''),
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
  const [keyword, setKeyword] = useState('')
  const [limit, setLimit] = useState(20)
  const [sheetId, setSheetId] = useState(SHEET_ID)
  const [sheetName, setSheetName] = useState('')
  const [copied, setCopied] = useState(false)
  const [runs, setRuns] = useState<RunListItem[]>([])
  const [runsLoading, setRunsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/explorer/runs')
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false))
  }, [])

  const deleteRun = async (id: string) => {
    if (!confirm('Удалить прогон?')) return
    await fetch(`/api/explorer/runs?id=${id}`, { method: 'DELETE' })
    setRuns((rs) => rs.filter((r) => r.id !== id))
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

      {!runsLoading && runs.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            История прогонов
            <span className="text-xs text-slate-500 font-normal">({runs.length})</span>
          </h2>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {runs.map((r) => {
              const emoji = r.verdictLevel === 'GO' ? '🟢' : r.verdictLevel === 'MAYBE' ? '🟡' : '🔴'
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-800/60 group"
                >
                  <span className="text-base">{emoji}</span>
                  <Link
                    href={`/explorer/${r.id}`}
                    className="flex-1 grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 text-sm"
                  >
                    <span className="font-semibold text-slate-100">{r.keyword || '—'}</span>
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
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-slate-900 rounded-xl p-6 space-y-4 mb-6">
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
