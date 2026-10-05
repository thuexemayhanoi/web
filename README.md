# Hanoi Motorbike Rental - Nguyen Tu

SOURCE REPOSITORY: thuexemayhanoi/web

OFFICIAL PRODUCTION DOMAIN: https://app.rentbikehanoi.com/

PRIMARY SEO KEYWORD: Hanoi Motorbike Rental

CONTENT ARCHITECTURE: SEO Hub -> Silo -> Cluster

TARGET: scalable foundation for approximately 1,000 English articles

## Structure

- index.html - SEO Hub homepage (Hanoi Motorbike Rental)
- /hanoi-motorbike-rental/ ... /motorbike-guides/ - 10 hub foundation pages
- privacy-policy.html, terms-of-use.html - legal pages
- assets/css/style.css - light/dark theme, app-like UI
- assets/js/business-config.js - SINGLE SOURCE OF TRUTH for business name, address, phone, email, Maps, opening hours, timezone, pricing, contact methods
- assets/js/app.js - theme, mega menu, mobile drawer, bottom dock, motorbike filter, rental calculator, Open/Closed status, Quick Contact, chat toggle
- assets/js/assistant.js - rule-based local chatbot (no API, no backend)
- robots.txt, sitemap.xml, 404.html, CNAME (do not remove CNAME)

## Shared business configuration

All business data (NAP, hours 09:00-21:00 daily, timezone Asia/Ho_Chi_Minh, verified pricing, contact methods) lives in assets/js/business-config.js. The calculator, Open/Closed status and assistant all read this config. Never hard-code the same data elsewhere.

## Pricing source (verified)

- Honda Wave / Yamaha Sirius / Yamaha Mio / Honda Click: 150,000 VND/day, 700,000 VND/week, 900,000-1,200,000 VND/month
- Honda Vision: 200,000 VND/day, 1,000,000 VND/week, 1,800,000-2,000,000 VND/month
- Honda Air Blade / Electric: 200,000 VND/day, 1,000,000 VND/week, 1,500,000 VND/month
- 50cc Scooter / Motorbike: 200,000 VND/day only. No verified weekly/monthly 50cc price - show "Contact us".

The calculator uses these real values. It never derives week = day x 7 or month = day x 30. Monthly ranges stay ranges.

## Features

- Light/dark mode: localStorage preference, prefers-color-scheme fallback, theme-color meta update, no flash (pre-paint inline script)
- Rental calculator: model + period + quantity, Intl.NumberFormat VND, verified ranges preserved
- Motorbike selector: category filter (semi-automatic, scooter, 50cc, electric), no live availability claims
- Open/Closed: computed against Asia/Ho_Chi_Minh, never device timezone
- Quick Contact: round floating bubble (bottom-left) - Call, Email, Maps (verified only; Zalo/WhatsApp hidden until verified)
- Chat Assistant: separate round bubble (bottom-right), rule-based, English, uses shared config, never invents prices/policies
- Mobile bottom dock: Home, Rent, Prices, Trips, Contact

## Business

Motorbike Rental - Nguyen Tu
112 Nguyen Van Cu, Long Bien, Hanoi, Vietnam
Phone 0942 467 674 - Open 09:00-21:00 daily
