---
published: false
---

# SEO Round 2 - checkpoint

Resume here. Updated after every batch. Branch: `claude/seo-round2` (from `main` 3f7c22e).

## State

| Item | Status |
|---|---|
| PR #1 (noindex guard, QA on PRs) and PR #2 (B14-B21) | merged to `main` 2026-10-24, CI green, Pages deployed |
| Production verified after deploy (TinyFish fetch, ttl 0) | homepage title with "Nguyen Tu", deposit table, electric "Contact us", robots.txt Disallow list, /about/ and /contact/ live |
| Baseline (before Round 2 fixes) | `reports/seo-round2-baseline.json`: crawl P0 0, P1 136, P2 54; matrix P0 0, P1 0, P2 988 (C-NO-PHOTOS) |
| B22 technical batch | done: breadcrumb schema on 136 articles, duplicate FAQ h2 on 12, hero alt; crawl now P0 0, P1 0, P2 41 |

## Evidence found, not yet fixed

1. **Hanoi Low Emission Zone (in force since 1 July 2026)** is missing from the site. Official source: Hanoi Department of Agriculture and Environment scheme published on the Government portal (xaydungchinhsach.chinhphu.vn, 5 Jul 2026), Decision 3273/QD-UBND. Verified rules: Ring Road 1, 9 wards; phase 1 (1 Jul - 31 Dec 2026) in Areas 1 and 2 of Hoan Kiem ward; Area 1 (walking-street area around Hoan Kiem Lake and the night market): all motorbikes, mopeds and cars banned 19:00-24:00 Fri/Sat/Sun, enforced from the evening of 3 Jul 2026; no blanket ban on petrol motorbikes; petrol ride-hailing motorbikes banned from 2027; motorbikes below emission level 3 (QCVN 99:2025/BNNMT) not allowed from 2028; free buses inside Ring Road 1 until 30 Jun 2027. The Old Quarter hub only says "check current signs".
2. **"The mistake is ..." paragraph template**: 2,700 paragraphs; in four hubs (buying vs renting, monthly, Old Quarter, trips: about 416 articles) nearly every article has 5-9 of them. Highest template fingerprint in the corpus.
3. **Unverifiable operating claims** (about 100-200 sentences): "the staff ride these districts daily", "a shop that sends bikes west weekly", "the shop sits on a stream of returning riders". Rule: no invented experience.

## Next

1. Research workflow (read-only): production vs repo sample, PageSpeed, SERP intent per target keyword, legal-fact verification, visibility evidence.
2. Edit workflow: homepage + 10 hubs (+ LEZ section from one data source), with adversarial review.
3. Article workflow: rewrite the "The mistake is" closers on the worst hubs, neutralise unverifiable operating claims; JSON in/out with validators.
4. Full QA, PR, CI, merge, verify production, write `reports/seo-round2-report.md`.

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
