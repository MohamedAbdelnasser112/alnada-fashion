# الندى | Al Nada — Shopping Cart Extension Outcomes

## Quick add and persistent cart
Add a small elegant cart icon beside every product without replacing the existing product-card design. Clicking it adds the product immediately without opening the detail page or requesting color/size, shows an Arabic success message, updates the cart counter automatically, merges repeated product additions safely, and preserves cart contents in localStorage while navigating between pages.

## Cart drawer and line controls
When opened, the cart displays every product image, name, unit price, quantity, line total and grand total. The customer can increase or decrease quantities, remove a line, and see totals update immediately on desktop and mobile RTL layouts.

## Variant selection at checkout
Do not request color or size during quick add. At checkout, request only the color and size options that actually exist for each cart product, allow selection per line, show unavailable combinations and stock messages, cap quantity by live stock, and block submission until each required selection is complete.

## One multi-product order
After cart choices, continue into the existing order flow once for the entire cart: customer name, phone, university/external delivery, university or address, pickup date and cash/prepaid payment via Digital Wallet or InstaPay. Save one order in the database before opening WhatsApp. The order snapshot must contain every product, URL, selected color, selected size, quantity, unit price, line totals, final total, customer, delivery and payment data. The order remains saved even if WhatsApp is not sent.

## Admin cart controls and order review
Add admin settings to independently enable/disable quick add and show/hide cart icons. Preserve the existing admin order list and detail review, making multi-product line choices, quantities, stock context and totals visible.

## Compatibility and delivery
Preserve the existing premium feminine Al Nada identity, Arabic RTL behavior, responsive behavior, product detail route, variants, inventory validation, university delivery, external delivery, payment review, transfer proof, WhatsApp behavior, secure admin login and durable storage. Use additive changes only and run the production build before checkpointing.

## Review hardening
The final review fixes are included: detail-page ordering preserves existing quick-cart lines; quick-add and drawer quantities are capped by current stock; order creation uses a row-locking transaction with atomic stock decrement and rollback; malformed localStorage cannot block storefront boot; and admin customer WhatsApp links use normalized international numbers.

## Previously delivered outcomes retained
Product detail pages, multiple galleries, color/size variants, per-variant stock, university logo management, public storefront content management and the server-backed admin dashboard remain part of this release.
