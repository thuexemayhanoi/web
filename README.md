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

Do not edit the generated shared header/footer in `index.html`. Instead, edit `site/partials/header.html` or `site/partials/footer.html` and rebuild with:

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

Factory infrastructure smoke-tested on 2026-10-06: hidden inbox trigger, no-op processing, state/report commit and safe stop behavior passed.

## One-place edit → all pages (automation and regression checks)

The HTML already uses shared partials, hooks, design tokens, centralized business data, build-generated schema/social tags, CTA and bounded related-link recommendations. Do **not** create a second theme framework or manually patch every article.

To update a shared element, edit only its source: `site/partials/**` (header/footer/CTA/floating UI), `site/hooks.html` (global announcement or article slots), `data/site-system.json` (NAP, CTA, feature flags and per-silo CTA), or `assets/css/style.css` (design tokens). Per-article content remains in its existing path. The site uses static HTML to keep existing URLs and Google crawlability.

When these central source files change on `main`, **SEO Maintenance** rebuilds generated pages, runs both SEO and shared-component QA, and commits the generated files back to `main` if needed. Native GitHub Pages publishes the updated branch. A concurrent push may cause SEO Maintenance to stop safely rather than overwrite a newer commit; rerun it via Actions > SEO Maintenance > Run workflow when needed. Regular scheduled maintenance remains a fallback.

The shared-component guard `node tools/qa-shared-components.mjs` verifies that every generated HTML page uses the exact header, footer, floating UI, scripts and hook content from its single source of truth. It runs in both **Site Build and QA** and **SEO Maintenance**. It does not modify pages. Run the full checks in this order:

```bash
node tools/build-site.mjs
node tools/seo-fix.mjs
node tools/qa-site.mjs
node tools/qa-shared-components.mjs
node tools/seo-audit.mjs
node tools/build-site.mjs --check
node tools/seo-fix.mjs --check
```

Avoid putting real customer names, unverified prices, or marketing claims into shared schema, CTA or automation. For a new section, first add a small optional shared hook and verify it creates no unexpected visual/SEO differences before enabling it globally.

## Collapsible article contents and paginated related reading

`tools/build-site.mjs` replaces legacy hardcoded article TOCs with a lightweight, native `<details>` outline built only from the H2/H3 headings in the editorial article body. It places the expandable Table of Contents immediately after the first H2 and preserves existing heading IDs. New IDs are generated only for headings that lack one. Pages without at least two H2/H3 entries and one H2 do not display a TOC. Home, FAQ and legal pages are excluded. Change `features.articleToc` in `data/site-system.json` to disable automatic TOCs.

Related links are selected from explicit configuration, then Content Matrix targets, then the same hub/silo; duplicates and broken page candidates are excluded, with a hard limit of nine. The generated section shows three cards initially. The existing `assets/js/app.js` provides Previous / Next controls (three cards per view), no framework or dependency. New articles automatically inherit both UI features.

**Do not edit 1,000 HTML files to change these components.** Edit the central generator, CSS tokens, JS or Content Matrix instead. GitHub SEO Maintenance regenerates published HTML, runs `tools/qa-article-ui.mjs` along with the existing QA checks and commits outputs to main before GitHub Pages publishes.

## Blog discovery & publisher components

**Blog search:** Site search is in `site/partials/header.html` and the shared `site/partials/scripts.html`. The lightweight `assets/js/site-search.js` opens an accessible search dialog, loads `/assets/search/article-index.json` **only on demand**, and searches article titles, descriptions, H2/H3 headings, and matrix primary keywords. The catalog is built deterministically by `node tools/build-article-index.mjs` from published Content Matrix entries; the existing chatbot index remains unchanged.

**Adjacent posts:** `tools/build-site.mjs` selects the previous and next **published cluster** by their Content Matrix order inside the same hub directory, and creates `SLOT:POST_NAV` within each article automatically. The navigation never crosses silos or invents pages. The first/last article naturally has a single neighbor.

**Publisher box:** `site/partials/author-box.html` creates a branded information panel on cluster posts. Its source of truth is `data/site-system.json`. We identify the **publisher/brand**, not an unverified individual author. Set `features.authorBox`, `features.postNavigation`, or `features.siteSearch` to false to disable a component. Generated article HTML is managed by the build; do not edit hundreds of posts manually.

**QA:** `node tools/build-site.mjs`, `node tools/build-article-index.mjs`, and `node tools/qa-discovery.mjs` verify these functions. SEO Maintenance runs them and syncs generated output to the native GitHub Pages branch.
