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
- `data/site-system.json` — source of truth for business data, prices, related cards and shared site settings\n- `assets/js/business-config.js` — generated runtime mirror of `data/site-system.json`
- `assets/js/app.js` — theme, dropdowns, drawer, bottom dock, Open/Closed status
  (Asia/Ho_Chi_Minh), bike filter, price calculator, Quick Contact + chat toggling
- `assets/js/assistant.js` — rule-based English chatbot (verified prices, hours, location; conservative fallbacks)

## UI features

- Sticky translucent header, mega dropdowns (Rentals / Prices / Travel / Guides), keyboard accessible, Escape and outside-click close
- Mobile/tablet accordion drawer, safe-area aware; no permanent bottom dock
- Verified-price calculator: "Number of motorbikes" quantity, real weekly rates (never day×7), monthly ranges stay ranges, 50cc week/month shows a contact message
- Quick Contact FAB (Call / Email / Maps) and chatbot FAB, mutually exclusive, no auto-open
- Visible focus states, 44px minimum touch targets, `prefers-reduced-motion` support

## Business data (verified)

Motorbike Rental - Nguyen Tu, 112 Nguyen Van Cu, Long Bien, Hanoi, Vietnam.
Phone 0942 467 674 · nguyentuantu8x@gmail.com · 09:00–21:00 daily.

Only verified prices are published. Never invent prices, availability,
promotions, deposits or policies.

Last UI/UX and chatbot update: 2026-10-05.

## Shared navigation and footer

Header/drawer and footer are generated from `site/partials/header.html` and `site/partials/footer.html`.
Do not use `index.html` as the shared-component source anymore. Run `node tools/build-site.mjs` locally when previewing generated shared components.


## Shared build architecture

The site remains plain static HTML with no framework and no external build dependency. GitHub Pages now runs a small Node build before deploy:

```bash
node tools/build-site.mjs
node tools/qa-site.mjs
node tools/build-site.mjs --check
```

Source-of-truth files:

- `data/site-system.json` — domain, logo, NAP, hours, prices, contact methods, CTA settings, related-link map and card catalog.
- `site/partials/header.html` — one shared desktop/mobile header + drawer.
- `site/partials/footer.html` — one shared footer.
- `site/partials/article-cta.html` — one shared article CTA.
- `site/partials/related-card.html` — reusable related-link card component.
- `site/hooks.html` — empty global hook slots for an announcement/banner, article slot, or pre-footer component.
- `site/templates/article.html` — lightweight template for future generated posts.
- `assets/css/style.css` — global CSS variables/design tokens and components.

The build keeps current URLs and article bodies intact. It synchronizes shared components, generates JSON-LD from each page's existing title/description/canonical/breadcrumbs, regenerates FAQ schema from the FAQ content, and generates related cards from the centralized map (falling back to `data/content-matrix.csv` for future pages).

**Do not manually copy shared header/footer/CTA/schema into new pages.** Use the slots/template and let the build render them. To change a site-wide CTA, contact detail, logo, hours, schema business entity, related-card metadata, or navigation/footer, edit the corresponding source file once and deploy.

The old command remains supported:

```bash
node tools/sync-shared-navigation.mjs
```

It is now a compatibility alias for the full shared-site build.


The site uses static HTML for crawlability, but the shared header/drawer and footer are marked with:

- `<!-- SHARED_NAV_START --> ... <!-- SHARED_NAV_END -->`
- `<!-- SHARED_FOOTER_START --> ... <!-- SHARED_FOOTER_END -->`

Edit the shared navigation/footer in `index.html`, then sync the same structure to all marked HTML pages with:

```bash
node tools/sync-shared-navigation.mjs
```

The current top-level order is:

Home → About → Rentals → Prices → Trips & Travel → Guides → FAQ → Contact → Privacy Policy → Terms of Use.

The footer contains the same top-level anchors so navigation labels and URLs stay consistent across the site.


## Shared build architecture

The site remains plain static HTML with no framework and no external build dependency. GitHub Pages now runs a small Node build before deploy:

```bash
node tools/build-site.mjs
node tools/qa-site.mjs
node tools/build-site.mjs --check
```

Source-of-truth files:

- `data/site-system.json` — domain, logo, NAP, hours, prices, contact methods, CTA settings, related-link map and card catalog.
- `site/partials/header.html` — one shared desktop/mobile header + drawer.
- `site/partials/footer.html` — one shared footer.
- `site/partials/article-cta.html` — one shared article CTA.
- `site/partials/related-card.html` — reusable related-link card component.
- `site/hooks.html` — empty global hook slots for an announcement/banner, article slot, or pre-footer component.
- `site/templates/article.html` — lightweight template for future generated posts.
- `assets/css/style.css` — global CSS variables/design tokens and components.

The build keeps current URLs and article bodies intact. It synchronizes shared components, generates JSON-LD from each page's existing title/description/canonical/breadcrumbs, regenerates FAQ schema from the FAQ content, and generates related cards from the centralized map (falling back to `data/content-matrix.csv` for future pages).

**Do not manually copy shared header/footer/CTA/schema into new pages.** Use the slots/template and let the build render them. To change a site-wide CTA, contact detail, logo, hours, schema business entity, related-card metadata, or navigation/footer, edit the corresponding source file once and deploy.

The old command remains supported:

```bash
node tools/sync-shared-navigation.mjs
```

It is now a compatibility alias for the full shared-site build.


### Additional shared controls

The shared build also centralizes pieces that used to be copied into every HTML file:

- `site/partials/floating-ui.html` — Quick Contact + chatbot UI.
- `site/partials/scripts.html` — shared JS includes and one cache-busting version.
- `data/site-system.json > assets.version` — bump one value to refresh CSS/JS across the whole site.
- `data/site-system.json > features` — feature flags for schema, social meta, article CTA, related posts, Quick Contact, chatbot and future content-image lazy loading.
- `data/site-system.json > ctaBySilo` — optional per-silo CTA overrides. Empty by default, so the current UI stays unchanged.
- Related links use the explicit map first, then Matrix targets, then a same-Hub/Silo fallback for future pages. This keeps automatic linking bounded and avoids random site-wide link injection.
- Open Graph/Twitter metadata is regenerated at build time from each page's existing title, meta description and canonical, while site name/logo come from central config.
- Build QA now hard-fails on broken internal references, duplicate canonicals/titles, missing H1/canonical/schema requirements, missing sitemap coverage and missing image alt attributes. Title/description length checks are warnings so publishing is not blocked by subjective SEO thresholds.

The build deliberately does **not** add a bundler/framework. Assets remain plain CSS/JS because that is lighter and easier to maintain for this static GitHub Pages site.

## Continuous article factory

This repo now has a lightweight production loop for scaling toward **1,000 total content pages** while keeping the external writer focused on writing.

Writer boundary:
- Read assignments from `data/writer-queue.json`.
- Write only `_factory/inbox/<ID>.article`.
- Follow `factory/WRITER.md`.
- Do not edit workflow code, shared components, sitemap, factory state, or Matrix status fields.

Factory boundary:
`writer draft → structural normalization → scoped first-pass QA → publish to Matrix path → shared build → verify batch → search index → commit → GitHub Pages deploy → next queue`

Operational files:
- `data/factory-config.json` — target, batch size and hot-loop limits.
- `data/factory-state.json` — pause/block/target state.
- `data/writer-queue.json` — next assignments for the writer.
- `tools/factory.mjs` — queue/process/verify/status engine.
- `.github/workflows/article-factory.yml` — continuous factory workflow.
- `reports/factory-last-run.json` — persisted last-run report.

Existing non-legal content rows are baseline `PUBLISHED`; legal pages are `EXCLUDED`. Future article rows must be added to `data/content-matrix.csv` with `factory_status=PLANNED`. Refresh Queue claims the next 10 rows by default.

The hot loop deliberately avoids deep SEO/cannibalization audits. A content failure goes to `REPAIR`; after the retry limit it becomes `BLOCKED`, the factory stops safely, keeps previously published work, and records the failing IDs.
