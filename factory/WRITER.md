# Writer contract

The external writer writes article drafts only. Do not edit factory workflows, factory scripts, site-wide config, sitemap, shared components, or factory status fields.

## Loop

1. Read `data/writer-queue.json`.
2. For every item in `queue`, create one file: `_factory/inbox/<ID>.article`.
3. Use `site/templates/article.html` as the page shape.
4. Fill title, meta description, canonical, breadcrumbs, H1 and article body from the Matrix brief.
5. Keep all `<!-- SLOT:... -->` markers. Do not copy the shared header/footer/schema/CTA manually.
6. Commit/push up to the queued batch (default 10).
7. Pull the factory commit and continue with the next queue.

Stop only when the queue says `TARGET_REACHED`, `PAUSED`, `BLOCKED`, or `PLAN_EXHAUSTED`.

## First-pass gate

- exactly one H1;
- canonical must match the Matrix URL on `https://app.rentbikehanoi.com/`;
- 1,500-5,000 editorial words;
- SEO title must be 50-75 characters;
- URL/path must be unique across the Matrix and current site;
- SEO title must be unique across the current site;
- SEO score must be 75-100 before publication;
- 3-10 useful internal links and at least one Matrix target link;
- no broken local links;
- no legacy `github.io` or `/web/` production URLs;
- do not invent prices, availability, promotions, guarantees, branches, delivery promises, deposits, or policies.

The factory handles shared shell, schema, CTA, related cards, search index, sitemap, commit and deploy.

## SEO score

The factory calculates a deterministic 0-100 first-pass SEO score from title length, unique title, unique URL/path, meta description, canonical, H1, word count, internal links, primary-keyword use and Matrix target linking. A draft below 75 is returned to REPAIR even if the HTML is otherwise valid.
