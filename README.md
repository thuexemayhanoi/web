# Hanoi Motorbike Rental — app.rentbikehanoi.com

Multi-page English SEO blog for **Motorbike Rental - Nguyen Tu**, a motorbike rental
shop in Long Bien, Hanoi, Vietnam. This repository is the source and deployment source;
the official production website and ONLY SEO domain is:

**https://app.rentbikehanoi.com/**

All canonical URLs, sitemap entries, Open Graph URLs, structured data, breadcrumbs and
internal links use https://app.rentbikehanoi.com/ exclusively. The GitHub Pages URL of
this repository must never be used as the SEO domain.

## Site architecture

The site is a real multi-page SEO blog (not a one-page app):

Homepage (root editorial hub)
→ Hub (category/silo page, one per silo)
→ Silo / Subtopic sections inside each hub
→ Articles (cluster pages, added under each hub over time)

### Pages

- `/` — homepage: hero, verified prices, motorbike selector with filters, rental
  calculator, cost / 50cc / scooter / Old Quarter / monthly / trips sections,
  how-it-works, contact + map, hub directory, FAQ.
- `/hanoi-motorbike-rental/` — main Hanoi Motorbike Rental hub
- `/hanoi-50cc-motorbike-rental/` — 50cc cluster hub
- `/hanoi-scooter-rental/` — automatic scooter hub
- `/hanoi-motorbike-rental-cost/` — prices and cost hub
- `/motorbike-rental-hanoi-old-quarter/` — Old Quarter and Hanoi areas hub
- `/monthly-motorbike-rental-hanoi/` — monthly / long-term hub
- `/hanoi-motorbike-trips/` — trips and routes hub
- `/hanoi-motorbike-for-sale/` — buying vs renting (informational intent)
- `/renting-a-motorbike-in-vietnam/` — complete Vietnam rental guide
- `/motorbike-guides/` — safety, parking, fuel, maintenance guides
- `/privacy-policy.html`, `/terms-of-use.html`, `/404.html`
- `/sitemap.xml` — homepage + 10 hubs + privacy + terms (13 URLs)
- `/robots.txt` — points to https://app.rentbikehanoi.com/sitemap.xml

Every hub page is a standalone crawlable page with a unique title, meta description,
H1, canonical URL, breadcrumb (with BreadcrumbList + WebPage schema), introductory
content, subtopic sections, a planned-cluster section, related-hub links, a link back
to the homepage, the full header with SEO dropdown navigation, the full footer, the
mobile dock, Quick Contact and the chatbot assistant.

## Business configuration

`assets/js/business-config.js` is the single source of truth for NAP, opening hours,
contact methods and pricing:

- Name: Motorbike Rental - Nguyen Tu
- Address: 112 Nguyen Van Cu, Long Bien, Hanoi, Vietnam
- Phone: 0942 467 674 (tel:+84942467674)
- Email: nguyentuantu8x@gmail.com
- Hours: 09:00–21:00 daily (Asia/Ho_Chi_Minh)
- Verified prices in VND; monthly entries are ranges and stay ranges;
  50cc has a verified daily price only (weekly/monthly = contact us).

## Features

- Light/Dark theme (localStorage + prefers-color-scheme, pre-paint script, theme-color meta)
- Sticky translucent header with keyboard-first mega dropdowns
- Mobile drawer with focus trap + mobile bottom dock
- Open/Closed status badge computed against Asia/Ho_Chi_Minh
- Motorbike selector with category filters
- Rental calculator using verified prices only (never day×7 or day×30;
  monthly ranges stay ranges; unverified periods show a contact message)
- Floating Quick Contact (Call / Email / Maps) — no Zalo/WhatsApp (unverified)
- Rule-based English chatbot assistant (no backend, conservative fallbacks)
- robots.txt, sitemap.xml, 404 page, privacy policy, terms of use

## Content rules

- Natural English for tourists, expats and international visitors.
- Never invent prices, availability, promotions, discounts, guarantees,
  branches, delivery times, phone numbers or rental policies.
- No keyword stuffing; one strong page per search intent.
- Cluster articles link upward to their parent hub and relevant commercial pages.
