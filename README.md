# Hanoi Motorbike Rental - Nguyen Tu

Official website and production deployment source.

- Production / SEO domain: https://app.rentbikehanoi.com/
- This repository is the source code only. Never use the GitHub Pages URL as the SEO/canonical domain.

## Structure

- index.html - SEO Hub homepage (Hanoi Motorbike Rental)
- assets/css/style.css - light/dark theme styles
- assets/js/app.js - theme switch, navigation, drawer, Hanoi open/closed status, rental price calculator
- assets/img/favicon.svg - icon
- robots.txt - references https://app.rentbikehanoi.com/sitemap.xml
- sitemap.xml - production URLs only
- 404.html - fallback page
- CNAME - custom domain, do not remove

## Hub / Silo architecture

The homepage is the root SEO Hub. Navigation groups (Rentals, Prices, Locations, Trips & Travel, Guides, Motorbikes) define the silos. Each silo expands into cluster articles under root-relative slugs such as /hanoi-motorbike-rental/, /hanoi-50cc-motorbike-rental/, /hanoi-motorbike-rental-cost/, /motorbike-rental-hanoi-old-quarter/, /hanoi-motorbike-trips/.

Until those cluster/silo pages exist, navigation links point to the matching homepage anchor sections (e.g. /#prices, /#models). When a silo page is published, update the corresponding nav, drawer and footer links from anchors to the real slug.

## Editing points

- Opening hours: BUSINESS object in assets/js/app.js (Asia/Ho_Chi_Minh, 09:00-21:00)
- Rental prices: PRICES object in assets/js/app.js (verified prices only; null = contact us; monthly ranges stay ranges)
- Theme palette: CSS variables in assets/css/style.css

## Business

Motorbike Rental - Nguyen Tu
112 Nguyen Van Cu, Long Bien, Hanoi, Vietnam
Open daily 09:00 - 21:00 (Hanoi time)
