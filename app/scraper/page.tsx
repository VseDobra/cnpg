'use client'

import { useState } from 'react'

const SHEET_ID = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID ?? ''

function buildScript(keyword: string, limit: number, sheetId: string, sheetName: string) {
  const tab = sheetName.trim() || `${keyword.trim()}_${new Date().toISOString().slice(0, 10)}`
  return `(async () => {
  const SHEET_ID = ${JSON.stringify(sheetId)};
  const KEYWORD = ${JSON.stringify(keyword)};
  const LIMIT = ${limit};
  const TAB_NAME = ${JSON.stringify(tab)};
  const API = 'http://localhost:3000/api/scrape/full';

  const log = (...a) => console.log('%c[scrape]', 'color:#0ff', ...a);
  const err = (...a) => console.error('%c[scrape]', 'color:#f55', ...a);

  // fetch with timeout — Coupang sometimes hangs forever under throttle
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

  const ids = [];
  const seen = new Set();
  for (let pageNum = 1; pageNum <= 5 && ids.length < LIMIT; pageNum++) {
    log(\`страница поиска \${pageNum}\`);
    try {
      const r = await tfetch(\`/np/search?q=\${encodeURIComponent(KEYWORD)}&page=\${pageNum}\`);
      const html = await r.text();
      for (const m of html.matchAll(/\\/vp\\/products\\/(\\d+)/g)) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        ids.push(m[1]);
        if (ids.length >= LIMIT) break;
      }
    } catch (e) { err('search page ' + pageNum + ' failed', e); }
    await new Promise(r => setTimeout(r, 500));
  }
  log(\`найдено productId: \${ids.length}\`, ids);
  if (!ids.length) { err('Нет productId. Открой: https://www.coupang.com/np/search?q=' + encodeURIComponent(KEYWORD)); return; }

  const reviews = [];
  for (let i = 0; i < ids.length; i++) {
    const pid = ids[i];
    try {
      const fd = await tfetchJson(\`/next-api/review?productId=\${pid}&page=1&size=20&sortBy=ORDER_SCORE_ASC&ratingSummary=true\`);
      const paging = fd?.rData?.paging;
      if (!paging) { err(\`[\${i+1}/\${ids.length}] \${pid} — нет paging\`); await new Promise(r => setTimeout(r, 2000)); continue; }
      const totalPage = Math.min(paging.totalPage ?? 1, 50); // cap to 50 pages = 1000 reviews max
      const before = reviews.length;
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
      log(\`[\${i+1}/\${ids.length}] \${pid} +\${added} (всего \${reviews.length}) — \${name}\`);
    } catch (e) {
      err(\`[\${i+1}/\${ids.length}] \${pid} — ошибка\`, String(e?.message ?? e));
    }
    // bigger pause between products — give Coupang's rate-limit breathing room
    await new Promise(r => setTimeout(r, 1500));
  }

  log(\`собрано отзывов: \${reviews.length}\`);

  // ========== Этап 2: данные по карточкам товаров ==========
  log('собираю данные по карточкам...');
  const products = [];
  for (let i = 0; i < ids.length; i++) {
    const pid = ids[i];
    try {
      const r = await tfetch('/vp/products/' + pid);
      const html = await r.text();
      // JSON-LD
      const jsonlds = [...html.matchAll(/<script type="application\\/ld\\+json"[^>]*>([\\s\\S]*?)<\\/script>/g)]
        .map(m => { try { return JSON.parse(m[1]) } catch { return null } })
        .filter(Boolean);
      const productLD = jsonlds.find(j => j['@type'] === 'Product');
      const breadcrumbLD = jsonlds.find(j => j['@type'] === 'BreadcrumbList');
      if (!productLD) { err(\`[\${i+1}/\${ids.length}] \${pid} — нет JSON-LD Product\`); continue; }

      const price = Number(productLD.offers?.price ?? 0);
      const originalPrice = Number(productLD.offers?.priceSpecification?.price ?? price);
      const discountPct = originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : 0;
      const breadcrumb = breadcrumbLD ? breadcrumbLD.itemListElement
        .flatMap(x => Array.isArray(x) ? x : [x])
        .map(x => x.name).filter(Boolean).join(' > ') : '';

      // Regex-добор: rocket badge, sales signal
      const isRocket = /로켓배송|로켓프레시|로켓와우|RocketDelivery|rocketDelivery/.test(html);
      const isWow = /와우회원/.test(html);
      const salesMatch = html.match(/한 ?달간 (\\d+(?:,\\d+)*)명/);
      const recentBuyers = salesMatch ? Number(salesMatch[1].replace(/,/g, '')) : null;
      // Seller (продавец)
      const sellerMatch = html.match(/판매자\\s*<[^>]*>([^<]+)</) || html.match(/"vendorName"\\s*:\\s*"([^"]+)"/);
      const seller = sellerMatch ? sellerMatch[1].trim() : '';
      // Coupon discount
      const couponMatch = html.match(/(\\d+(?:,\\d+)*)원\\s*쿠폰할인/);
      const couponDiscount = couponMatch ? Number(couponMatch[1].replace(/,/g, '')) : 0;

      products.push({
        productId: pid,
        name: String(productLD.name ?? ''),
        price,
        originalPrice,
        discountPct,
        couponDiscount,
        currency: String(productLD.offers?.priceCurrency ?? 'KRW'),
        rating: Number(productLD.aggregateRating?.ratingValue ?? 0),
        reviewCount: Number(productLD.aggregateRating?.ratingCount ?? 0),
        imageCount: Array.isArray(productLD.image) ? productLD.image.length : (productLD.image ? 1 : 0),
        firstImage: Array.isArray(productLD.image) ? productLD.image[0] : (productLD.image ?? ''),
        category: breadcrumb,
        url: String(productLD.offers?.url ?? ('https://www.coupang.com/vp/products/' + pid)),
        sku: String(productLD.sku ?? ''),
        availability: String(productLD.offers?.availability ?? '').includes('InStock') ? 'in_stock' : 'out',
        isRocket,
        isWow,
        recentBuyers,
        seller,
      });
      log(\`товар [\${i+1}/\${ids.length}] \${pid} \${price}₩ ⭐\${productLD.aggregateRating?.ratingValue ?? '—'} (\${productLD.aggregateRating?.ratingCount ?? 0})\`);
    } catch (e) {
      err(\`товар [\${i+1}/\${ids.length}] \${pid} — ошибка\`, String(e?.message ?? e));
    }
    await new Promise(r => setTimeout(r, 800));
  }
  log(\`собрано карточек: \${products.length}\`);

  // ========== Сохранение в window ==========
  window.__coupangReviews = reviews;
  window.__coupangProducts = products;
  window.__coupangMeta = { sheetId: SHEET_ID, sheetName: TAB_NAME, keyword: KEYWORD };
  window.__retryUpload = async () => {
    const r = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviews: window.__coupangReviews,
        products: window.__coupangProducts,
        sheetId: window.__coupangMeta.sheetId,
        sheetName: window.__coupangMeta.sheetName,
        keyword: window.__coupangMeta.keyword,
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + await r.text());
    const o = await r.json();
    console.log('%c[scrape]', 'color:#0ff', '✓ записано в Sheets:', o);
    const lines = [];
    if (o.verdict) {
      lines.push(o.verdict.text);
      lines.push('');
      const m = o.verdict.metrics;
      lines.push('Листингов: ' + m.products + ', медиана цены: ' + Number(m.medianPrice).toLocaleString() + '₩');
      lines.push('Средний рейтинг: ' + m.avgRating + ', медиана отзывов: ' + m.medianReviewCount);
      lines.push('Концентрация ТОП-3: ' + m.top3Concentration + '%, Rocket: ' + m.rocketShare + '%');
      lines.push('');
      for (const r of o.verdict.reasons) lines.push(r);
    }
    lines.push('');
    lines.push('Табы: ' + (o.tabs || []).join(', '));
    alert(lines.join('\\n'));
  };
  log('данные сохранены в window.__coupangReviews / window.__coupangProducts');
  log('повторная отправка: __retryUpload()');

  // ========== POST на сервер ==========
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviews, products, sheetId: SHEET_ID, sheetName: TAB_NAME, keyword: KEYWORD }),
    });
    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    const out = await res.json();
    log('✓ записано в Sheets:', out);
    const lines = [];
    if (out.verdict) {
      lines.push(out.verdict.text);
      lines.push('');
      const m = out.verdict.metrics;
      lines.push('Листингов: ' + m.products + ', медиана цены: ' + Number(m.medianPrice).toLocaleString() + '₩');
      lines.push('Средний рейтинг: ' + m.avgRating + ', медиана отзывов: ' + m.medianReviewCount);
      lines.push('Концентрация ТОП-3: ' + m.top3Concentration + '%, Rocket: ' + m.rocketShare + '%');
      lines.push('');
      for (const r of out.verdict.reasons) lines.push(r);
    }
    lines.push('');
    lines.push('Табы: ' + (out.tabs || []).join(', '));
    alert(lines.join('\\n'));
  } catch (e) {
    err('POST на localhost не прошёл, скачиваю JSON:', e);
    const blob = new Blob([JSON.stringify({ reviews, products, keyword: KEYWORD, sheetId: SHEET_ID, sheetName: TAB_NAME }, null, 2)], { type: 'application/json' });
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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Скрапер отзывов Coupang</h1>
      <p className="text-slate-400 text-sm mb-6">
        Coupang блокирует Playwright через Akamai. Поэтому работаем через твой обычный браузер:
        копируешь скрипт → вставляешь в DevTools на coupang.com → отзывы летят в Google Sheets.
      </p>

      <div className="bg-slate-900 rounded-xl p-6 space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ключевое слово</label>
            <input
              className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="훌라후프"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Кол-во листингов</label>
            <input
              type="number"
              className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              min={1} max={50}
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
              Открой в своём браузере страницу поиска Coupang:&nbsp;
              <a href={searchUrl} target="_blank" rel="noopener" className="text-cyan-400 underline break-all">
                {searchUrl}
              </a>
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
          <div className="text-amber-400 text-xs mb-2">Заполни «Ключевое слово» и «Google Sheet ID»</div>
        )}
        <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-300 font-mono overflow-x-auto max-h-80 overflow-y-auto">
          {script}
        </pre>
      </div>
    </div>
  )
}
