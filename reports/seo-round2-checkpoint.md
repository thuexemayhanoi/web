---
published: false
---

# SEO Round 2 - checkpoint

Resume here. Updated after every batch. Branch: `claude/seo-round2` (from `main` 3f7c22e).

## State (updated 2026-10-25)

| Item | Status |
|---|---|
| PR #1 and PR #2 (B14-B21) | merged to `main` 2026-10-24, CI green, Pages deployed, production verified |
| B22 technical batch | pushed on `claude/seo-round2`: breadcrumb schema on 136 articles, duplicate FAQ h2 on 12, hero alt; crawl P0 0, P1 0, P2 41 (baseline P0 0, P1 136, P2 54) |
| B23 content batch | pushed: 2,427 "The mistake is" openers rewritten (2,715 -> 406 site-wide), 220 unverifiable experience claims neutralised; `reports/round2-content-rewrites-2026-10-24.json` is the rollback log |
| B23 part 1 | pushed: `business.geo` in LocalBusiness schema (from the shop's Google Maps listing); `SLOT:LEZ` / `SLOT:LEZ_NOTE` mechanism in the build (no data yet) |
| B24 performance and UX | pushed: theme boot script and theme-color on every page (dark mode on 986 articles), undefined CSS tokens defined, 192 px favicon, hero 700w, brand aria-label; assets.version 20261024.3 |
| Not yet merged | branch `claude/seo-round2` has no PR yet; production still serves B14-B21 only |

## Evidence found, still to act on

1. **Hanoi Low Emission Zone (in force since 1 July 2026)** is missing from the site. Official source: Hanoi Department of Agriculture and Environment scheme on the Government portal (xaydungchinhsach.chinhphu.vn, 5 Jul 2026), Decision 3273/QD-UBND. Verified rules: Ring Road 1, 9 wards; phase 1 (1 Jul - 31 Dec 2026) in Areas 1 and 2 of Hoan Kiem ward; Area 1 (walking-street area around Hoan Kiem Lake and the night market): all motorbikes, mopeds and cars banned 19:00-24:00 Fri/Sat/Sun, enforced from the evening of 3 Jul 2026; no blanket ban on petrol motorbikes; petrol ride-hailing motorbikes banned from 2027; motorbikes below emission level 3 (QCVN 99:2025/BNNMT) not allowed from 2028; free buses inside Ring Road 1 until 30 Jun 2027. The Old Quarter hub only says "check current signs". Plan: fill `data/site-system.json > localRules.lowEmissionZone` (asOf, summary, points, phases, forRenters, noteShort, guideHref, sources), put `<!-- SLOT:LEZ -->` under an H2 on the Old Quarter hub and `<!-- SLOT:LEZ_NOTE -->` on the rental hub and the Old Quarter articles that discuss riding near the lake.
2. Research workflow (read-only agents write to the session scratchpad `r2/`: prod-verify, legal-facts, visibility, serp-<page>): perf-lab finished (performance already 96-100). The rest were relaunched on 2026-10-25 after a worker restart and a stall; if the scratchpad is gone, rerun `r2-research` with args `{"idx":[...]}`.

## Next

1. Key pages (homepage + 10 hubs): apply the gaps from the SERP/legal research with adversarial review; LEZ section from data.
2. Optional: branded 1200x630 OG images for the 11 key pages (no stock or AI photos presented as real).
3. Full QA, PR, CI, merge, verify production, write `reports/seo-round2-report.md`.

## Resume commands

```bash
git checkout claude/seo-round2
node tools/build-site.mjs && node tools/seo-fix.mjs && node tools/build-site.mjs   # dates propagate into schema
node tools/seo-crawl.mjs            # reports/seo-round2-crawl.json
node tools/qa-site.mjs && node tools/qa-shared-components.mjs && node tools/qa-article-ui.mjs \
 && node tools/seo-audit.mjs && node tools/qa-seo-guard.mjs && node tools/seo-fix.mjs --check \
 && node tools/build-site.mjs --check && node tools/qa-discovery.mjs && node tools/seo-intel.mjs --check
```

## Owner decisions still open

Yamaha Sirius (not in the owner's price table; shown at 150,000 VND/day on about 528 pages), WhatsApp verification, real photos of the shop and fleet, Google Search Console access.
