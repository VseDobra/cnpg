# /trends Page — Naver DataLab Shopping Insight Integration

## Overview

A new page at `/trends` that pulls search-demand data from the Naver DataLab Shopping Insight API and displays it alongside the user's existing Coupang products. The goal is to understand keyword demand trends in the Korean market and discover new keywords for listing optimization.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `app/trends/page.tsx` | Client component — full page UI |
| `app/api/trends/keywords/route.ts` | Proxy to Naver `shopping/category/keywords` |
| `app/api/trends/top/route.ts` | Proxy to Naver `shopping/category/keyword/ratio` |
| `lib/naver/datalab.ts` | Typed wrappers for Naver DataLab API calls |

### Modified files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `naverCategoryId String?` to `Product` model |
| `app/products/[id]/page.tsx` | Add "Naver категория" input field in product editor |
| `components/Sidebar.tsx` | Add `/trends` nav item |

### Environment variables (`.env.local`)

```
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```

### In-memory cache

API routes cache Naver responses in a `Map` keyed by `"${category}|${keywords.join(',')}|${startDate}|${endDate}"`. TTL: 24 hours. This protects the 25 000 req/day quota.

---

## Data Flow

1. Page loads → fetches `/api/products` (existing) to populate the product list with `searchTags` and `naverCategoryId`.
2. User clicks `[+]` next to a product → that product's `searchTags` are added as active keyword pills.
3. On keyword or period change → fetch `/api/trends/keywords` → renders LineChart.
4. Top-500 fetch → `/api/trends/top` using `naverCategoryId` of the first product the user activated. Updates if user activates a product in a different category.

**Keyword limit:** Maximum 5 keywords simultaneously (Naver API hard limit).

**Period switcher options:** `30д` (month/week), `90д` (3 months/week), `180д` (6 months/week), `365д` (year/month). Default: `90д`.

---

## UI Layout

```
┌──────────────────────────────────────────────────────────┐
│ Тренды Naver Shopping          [30д][90д][180д][365д]    │
├──────────────────┬───────────────────────────────────────┤
│ ТОВАРЫ           │ КЛЮЧЕВЫЕ СЛОВА                        │
│ • Товар 1   [+]  │ [캠핑의자 ×] [릴렉스체어 ×] [+ добавить] │
│ • Товар 2   [+]  │                                       │
└──────────────────┴───────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ График трендов (recharts LineChart)                      │
│ Y-axis: ratio 0–100, одна линия на ключевое слово        │
│ Skeleton-лоадер во время запроса                         │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ Топ-500 слов категории              [поиск по таблице]   │
│ # │ Слово           │ Доля (%)  │ [+ в график]           │
│ 1 │ 캠핑의자          │ 12.4      │                        │
└──────────────────────────────────────────────────────────┘
```

**Interactions:**
- `[+]` next to a product: adds all its `searchTags` to the active keyword set.
- `[+ в график]` in the top-500 table: adds that keyword to the active set and re-fetches the trend chart.
- Keyword pill `×`: removes the keyword from the active set.
- Manual input `[+ добавить]`: free-text input to add any keyword.

---

## Error Handling

| Condition | Behaviour |
|-----------|-----------|
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` missing | Banner: "Добавь NAVER_CLIENT_ID и NAVER_CLIENT_SECRET в .env.local" |
| Product has no `naverCategoryId` | `[+]` button disabled with tooltip "Укажи Naver-категорию в настройках товара" |
| Naver returns 429 (rate limit) | Show last cached result + warning badge |
| Naver returns empty data array | Message: "Нет данных за выбранный период" |
| Network error | Generic error state with retry button |

---

## Naver API Endpoints Used

| Purpose | Endpoint |
|---------|----------|
| Keyword click trends | `POST https://openapi.naver.com/v1/datalab/shopping/category/keywords` |
| Top-500 keywords in category | `POST https://openapi.naver.com/v1/datalab/shopping/category/keyword/ratio` |

Auth: `X-Naver-Client-Id` and `X-Naver-Client-Secret` headers.

---

## Out of Scope

- Demographic breakdown (age/gender/device) — not in this spec.
- Persisting search history to the database.
- Scheduled/automated trend fetching.
