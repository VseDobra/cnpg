# Dashboard Redesign — Design Spec
Date: 2026-05-16

## Summary
Full visual redesign of the Coupang Analytics Dashboard. All pages share the same layout shell (sidebar + main). Scope: global styles, sidebar, dashboard page, KpiCard component. Other pages inherit the new shell automatically.

## Color Palette

| Token | Value | Usage |
|---|---|---|
| bg-base | `#030712` | Page background |
| bg-card | `#0f172a` | Cards, sidebar |
| bg-card-hover | `#1e293b` | Hover states, inner elements |
| border | `#1e293b` | Card borders |
| border-accent | `#1e3a5f` | Featured card borders |
| accent-primary | `#0ea5e9` | Bars, buttons, charts |
| accent-secondary | `#22d3ee` | Active nav, top highlights, best values |
| text-primary | `#f1f5f9` | Headings, values |
| text-secondary | `#94a3b8` | Card labels |
| text-muted | `#475569` | Nav items, sub-labels |
| up | `#22d3ee` | Positive % change |
| down | `#f87171` | Negative % change |
| up-secondary | `#34d399` | Secondary positive (small badges) |

## Typography
- Font: system stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- Page title: 17px, weight 600, letter-spacing -0.3px
- Card labels: 11px, uppercase, letter-spacing 0.8px
- Big KPI values: 28px, weight 700, letter-spacing -0.5px
- Secondary KPI values: 18px, weight 600
- Nav items: 12.5px

## Sidebar
- Width: 220px, fixed, `bg-card` background
- Header: "Coupang" logo (no emoji), "Analytics Dashboard" subtitle
- Nav icons: **Lucide SVG icons** (15×15, stroke-width 2), replacing emoji
- Active item: `accent-secondary` text + left border, `bg-base` background
- Hover: `#cbd5e1` text, subtle bg
- Footer: sync indicator with cyan border, `bg-base` background

### Icon mapping
| Page | Lucide icon |
|---|---|
| Дашборд | LayoutGrid |
| Заказы | List |
| Товары | Store |
| Фото товаров | Image |
| Склад | Package |
| Финансы | DollarSign |
| Возвраты | Undo2 |
| Купоны | Tag |
| Вопросы | MessageSquare |
| Категории | Search |
| Тренды | TrendingUp |
| Настройки | Settings2 |

## Dashboard Page Layout

### KPI Block (top)
Two rows replacing the current single 5-column row:

**Row 1 — 2 featured cards** (grid 1fr 1fr):
- Gradient background: `linear-gradient(135deg, #0c1628, #0f172a)`
- 2px top accent line: `linear-gradient(90deg, #0ea5e9, #22d3ee)`
- Border: `#1e3a5f`
- Shows: label (uppercase), value (28px), % change, period label

**Row 2 — 3 secondary cards** (grid 1fr 1fr 1fr):
- Flat `bg-card` background
- Shows: label, value (18px), % change
- Metrics: Средний чек, Возвраты, Чистая прибыль

### Quick Stats Row
4-column strip (Сегодня / Вчера / Эта неделя / Прошлая неделя) — kept as-is, restyled to new palette.

### Charts Row
2fr + 1fr grid:
- Left: Sales chart (kept, restyled)
- Right: Day-of-week bars (kept, restyled)

### Bottom Row
2fr + 1fr grid:
- Left: Recent orders table
- Right: Inventory bars (low-stock in red)

## KpiCard Component Changes
- `bg-card` base
- Featured variant prop: adds gradient bg + top accent line
- Label: uppercase, letter-spacing
- Change colors: `up` = `#22d3ee`, `down` = `#f87171`

## globals.css
- Set `bg-base` as body background
- Remove unused CSS variables
- Keep Tailwind import

## Out of Scope
- Chart library internals (SalesChart, DowHeatmap components) — only wrapper/container restyling
- Data/API changes
- Other pages beyond shared shell
