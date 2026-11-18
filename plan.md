# الندى | Al Nada — Orders & Delivery Extension Plan

## Product scope
Extend the existing server-backed Arabic RTL Al Nada storefront and admin dashboard with a complete order flow. Preserve the current quiet-luxury brand identity while making `/admin` the control surface for delivery, university, payment, media and order settings.

## Architecture
The Node.js + Express server continues to serve the Vite public and admin entries. Managed MySQL remains the source of truth. Existing orders gain a JSON metadata column for delivery method, university/address, delivery date, payment method/status, transfer-proof presence and WhatsApp details. A persisted `site_content` key stores order settings; a new `universities` table stores names, logo URLs, official source URLs, active state, order and `coming_soon` state.

The public storefront reads `/api/public/order-config` for delivery settings, available days, universities and payment numbers. It submits validated orders to `/api/public/orders`, receives the saved order number and WhatsApp message URL, then opens WhatsApp after the database write succeeds. Admin APIs remain protected by the existing application session and expose CRUD for universities, order settings, media URLs and payment numbers.

## Admin capabilities
The dashboard adds an “إعدادات الطلبات” section for university CRUD, active/coming-soon switches, university and external delivery toggles, Digital Wallet/InstaPay/WhatsApp numbers, order copy, explainer-video URL/title/description and available pickup dates. Product and content forms retain their existing behavior; the hero/video URL can be changed and previewed from content management.

The orders view adds delivery/payment metadata, payment confirmation state, search/filter, status changes, details view and WhatsApp contact links. Payment is never marked paid automatically; prepaid orders begin as `pending_review` until an administrator confirms them.

## Public order experience
“اطلبي الآن” opens a responsive RTL order sheet with university or outside-university delivery. University cards show official source-based logos where available, a fallback monogram when a source asset cannot load, and a disabled “COMING SOON” card for Horus. The customer chooses an available date, supplies name and phone, selects cash or prepaid payment, sees the correct payment number with copy action, and may attach a transfer proof for prepaid orders. Outside-university delivery collects the complete address. Missing/invalid data blocks submission.

## Design direction
Keep the current Al Nada warm paper, cream, blush and dark-ink system. Use larger, heavier dashboard type and slightly larger icons without changing the layout language. Order steps should feel like a calm checkout drawer: clear section labels, generous fields, university cards, subtle selected borders and one confident CTA.

## Project structure
- `server/`: schema, seed defaults, order APIs, settings APIs, uploads and auth.
- `src/main.js` + `src/styles.css`: public hydration and order sheet.
- `src/admin/main.js` + `src/admin/styles.css`: admin order/settings CRUD and visual refinements.
- `public/manus-routes.json`: current page routes.
- `research.md`: verified university sources and logo decisions.
