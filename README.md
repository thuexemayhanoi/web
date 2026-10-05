# Hanoi Motorbike Rental — thuexemayhanoi/web

Official production and SEO website: **https://app.rentbikehanoi.com/**

English multi-page SEO blog for a motorbike rental service in Long Bien, Hanoi.
Architecture: **Home → Hub → Silo → Article** (homepage is the root editorial hub;
hub directories are category/silo pages; future cluster articles live under them).

## Site structure

- `index.html` — homepage (root SEO hub, targets "Hanoi Motorbike Rental")
- 10 hub pages, each in its own directory:
  - `/hanoi-motorbike-rental/`
  - `/hanoi-50cc-motorbike-rental/`
  - `/hanoi-scooter-rental/`
  - `/hanoi-motorbike-rental-cost/`
  - `/motorbike-rental-hanoi-old-quarter/`
  - `/monthly-motorbike-rental-hanoi/`
  - `/hanoi-motorbike-trips/`
  - `/hanoi-motorbike-for-sale/` (buying vs renting, informational intent)
  - `/renting-a-motorbike-in-vietnam/`
  - `/motorbike-guides/`
- `privacy-policy.html`, `terms-of-use.html`, `404.html` (noindex)
- `sitemap.xml`, `robots.txt` — reference only `https://app.rentbikehanoi.com/`
- `CNAME` — app.rentbikehanoi.com

Never use `thuexemayhanoi.github.io` in canonical URLs, sitemap, OG tags,
schema, or any SEO signal.

## Design system

Black / White / Orange identity (no blue, purple or pink):

| Token | Light | Dark |
|---|---|---|
| --bg | #f7f7f5 | #090909 |
| --surface | #ffffff | #111111 |
| --surface-2 | #f1f1ee | #181818 |
| --text | #111111 | #f7f7f7 |
| --muted | #626262 | #a8a8a8 |
| --brand | #f97316 | #fb923c |
| --brand-hover | #ea580c | #f97316 |

Green is used only for the factual OPEN status dot. Typography: Roboto stack,
16px body, 1.7 line-height, 1180px container, ~780px article width.
Light/Dark mode persists via `localStorage` with `prefers-color-scheme` fallback
and a pre-paint inline script (no flash). Radius 10–18px, spacing tokens
4/8/12/16/24/32/48/64.

## Assets

- `assets/css/style.css` — full design system, all components, 320px→desktop responsive
- `assets/js/business-config.js` — single source of truth: BUSINESS (NAP), PRICES, CONTACT_METHODS
- `assets/js/app.js` — theme, dropdowns, drawer, bottom dock, Open/Closed status
  (Asia/Ho_Chi_Minh), bike filter, price calculator, Quick Contact + chat toggling
- `assets/js/assistant.js` — rule-based English chatbot (verified prices, hours, location; conservative fallbacks)

## UI features

- Sticky translucent header, mega dropdowns (Rentals / Prices / Travel / Guides), keyboard accessible, Escape and outside-click close
- Mobile accordion drawer + bottom dock (Home / Rent / Prices / Trips / Contact), safe-area aware
- Verified-price calculator: "Number of motorbikes" quantity, real weekly rates (never day×7), monthly ranges stay ranges, 50cc week/month shows a contact message
- Quick Contact FAB (Call / Email / Maps) and chatbot FAB, mutually exclusive, no auto-open
- Visible focus states, 44px minimum touch targets, `prefers-reduced-motion` support

## Business data (verified)

Motorbike Rental - Nguyen Tu, 112 Nguyen Van Cu, Long Bien, Hanoi, Vietnam.
Phone 0942 467 674 · nguyentuantu8x@gmail.com · 09:00–21:00 daily.

Only verified prices are published. Never invent prices, availability,
promotions, deposits or policies.
