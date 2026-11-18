# الندى | Al Nada — Implementation Plan

## Product and brand direction
Preserve the existing quiet-luxury Al Nada identity: feminine editorial fashion, cream and blush surfaces, beige neutrals, dark brown typography, Arabic RTL layout, restrained rounded cards, generous whitespace and small purposeful motion. Product cards remain recognizable; new cart controls are subtle outline icons rather than a visual redesign.

## Existing application architecture
The public storefront is served from `/`, canonical product details from `/product/:id`, the admin login from `/admin/login`, and the protected dashboard from `/admin`. Vite builds the public and admin entries into `dist`; the Express server serves that build and owns the public catalog APIs, order APIs, admin APIs, managed MySQL access, sessions and durable media paths. `server/db.mjs` owns additive schema/seed behavior, `server/server.mjs` owns HTTP validation and transactions, `src/main.js` owns public RTL interactions, and `src/admin/main.js` owns the dashboard.

## Shopping-cart data flow
Use localStorage only for the visitor's pending cart and favorites; the database remains the source of truth for products, variants, stock and saved orders. A cart line carries product id, name, image, canonical product URL, unit price snapshot, quantity and optional color/size. Quick add merges by product id without opening details. A detail-page order merges by product id plus selected color/size so it never replaces existing cart lines. The cart is rehydrated on every public page and cleared only after the server confirms the order was saved.

## Quick add and cart drawer
Every dynamic product card receives a small cart icon beside its favorite action. The icon is controlled by the existing order-settings API: `quickCartEnabled` independently hides quick-add controls, while `cartIconVisible` independently controls the header bag. The drawer renders image, name, unit price, quantity, line total and grand total; it supports increase, decrease and remove actions and persists each change. Quick add and drawer increment use a safe stock cap: selected variant lines use exact live stock, unselected quick-add lines use the highest active variant stock, and no-variant products use product stock.

## Multi-product checkout
Checkout first renders one choice card per cart line. It shows only colors and sizes that exist for that product, pre-fills a single available choice, shows the matched stock, caps quantity, and blocks submission when a required choice is missing or unavailable. The existing delivery/payment step follows once for the entire cart: customer name, phone/email, university or external delivery, university/address, allowed delivery date, cash or prepaid Digital Wallet/InstaPay, optional transfer proof and WhatsApp handoff.

## Server order integrity
`POST /api/public/orders` recomputes product prices and line totals from the database, validates every product, active variant and quantity, and saves one order snapshot containing all line choices, quantities, URLs and totals. It uses a MySQL transaction with row locks, atomically decrements the selected variant or product stock, inserts the order, and rolls back on any validation, stock or insert failure. The WhatsApp URL is generated only after commit and contains every product line, choices, quantities, line totals, delivery, payment and final total. Admin order detail shows the same information and uses normalized customer phone numbers for WhatsApp links.

## Admin controls
Add the two cart toggles to the existing order-settings form. Keep the product variant editor as the inventory source. The order list and detail modal support multi-product review, including colors, sizes, quantities, line totals, final total, payment review and delivery context. The secure admin session and all existing content, product, university, media and category management remain unchanged.

## Reliability and validation
LocalStorage parsing is defensive so stale values cannot block storefront boot. The route manifest remains synchronized with `/`, `/product/:id`, `/admin` and `/admin/login`. Build and syntax checks run after the patch; API smoke checks cover cart settings, protected admin access, invalid variants, over-stock rejection, rollback preservation and rendered quick-cart hooks. No successful test order is created against the shared managed database.

## Project structure
- `src/main.js`: cart state, product-card quick add, stock caps, drawer controls, variant checkout and order handoff.
- `src/styles.css`: subtle cart icon, drawer controls and responsive checkout-choice styles.
- `server/server.mjs`: public cart-aware order normalization, transaction, stock decrement and WhatsApp details.
- `server/db.mjs`: persisted cart-setting defaults and existing catalog schema.
- `src/admin/main.js`: cart settings and multi-line order review.
- `src/admin/styles.css`: admin toggle and order-detail presentation.
- `index.html` and `public/manus-routes.json`: cart header hook and synchronized page routes.
- `TODO.md`: explicit acceptance outcomes for this release and retained prior features.
