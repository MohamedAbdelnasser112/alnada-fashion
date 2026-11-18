# الندى | Al Nada — Product Details & Variant Extension

## Scope
Extend the existing published server-backed Al Nada storefront without changing its quiet-luxury Arabic RTL identity. Product images and names open a dedicated detail route. The detail experience reads the selected product from the live catalog, supports gallery navigation, color swatches, size buttons, quantity, stock messaging and a direct `اطلبي الآن` path into the existing delivery/payment/WhatsApp order flow.

## Data architecture
Keep products and orders in the existing managed MySQL database. Add additive product-media and product-variant tables: `product_images` stores ordered durable storage URLs and alt text; `product_variants` stores one color/size combination, its display color value, stock and active state. Preserve existing product `sizes_json` and `colors_json` as fallback for legacy products, but make variants the source of truth when present. Order item snapshots will include selected color, size, quantity, unit price and product URL so historical orders do not change when catalog data changes.

Store uploads through the trusted server upload endpoint and persist only stable `/manus-storage/...` paths or validated external URLs. For deletion, soft-delete/hide media records and clear the product/university reference; runtime storage has no physical delete contract, so the UI will describe this as removing from the live catalog while preserving durable historical references.

## Public experience
Use `/product/:id` as the canonical product-detail page and preserve the existing single-entry server fallback. Product cards make both image and title links. The page keeps the current warm paper/blush palette: editorial gallery on one side, calm purchase panel on the other, larger Arabic type, hairline dividers, blush selected states and mobile stacking. Color swatches use actual configured color values, sizes become buttons, quantity is bounded by selected stock, and unavailable combinations show an inline Arabic message. The direct order action carries product name, canonical relative link, selected color, selected size, quantity and price into the current order sheet without asking the customer to re-enter them.

## Admin experience
Extend product create/edit with variant rows, independent stock per color/size, active state, multiple image upload/URL rows, ordering, preview and remove controls. Existing visibility, price, discount, description and category controls remain. The university editor gets two explicit logo paths: upload with preview/replace/remove and URL with validation, preview and clear. The Mansoura National University seed logo will be corrected to a stable official asset/fallback and rendered consistently in public cards and the admin list.

## Safety and compatibility
Validate variant combinations and stock server-side before accepting an order. Keep the existing payment, delivery, university, proof-upload and WhatsApp flow intact. Additive migrations must preserve existing products, orders, media and admin data. Use Arabic RTL and responsive behavior at desktop and mobile widths. Keep `/admin`, `/admin/login`, `/`, and `/product/:id` in the route manifest.

## Project structure
- `server/db.mjs`: additive tables, seed/fallback data and migrations.
- `server/server.mjs`: product detail, media/variant CRUD, university logo validation and variant-aware order validation.
- `src/main.js`: live catalog links, product detail renderer, selection state and order handoff.
- `src/styles.css`: detail/gallery/variant styling in the existing Al Nada system.
- `src/admin/main.js` and `src/admin/styles.css`: product variants/media and university logo controls.
- `public/manus-routes.json`: public route declarations.
