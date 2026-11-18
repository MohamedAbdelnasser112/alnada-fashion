# الندى | Al Nada — Product Details Extension Outcomes

## Product detail route and gallery
When the customer clicks a product image or name, open the canonical `/product/:id` page without losing the current Al Nada design. The page must show multiple product images with next/previous or thumbnail navigation, name, description, current price, discount price when present, stock state, available colors, available sizes, quantity selector and a responsive RTL layout.

## Product choices and validation
Render colors as real configured color swatches/blocks and sizes as available S/M/L/XL-style buttons. Each product manages its own combinations and stock. The customer cannot order before choosing a required color or size. Unavailable color/size combinations and out-of-stock selections show an Arabic inline message, and quantity cannot exceed the selected stock.

## Direct order handoff
The detail-page `اطلبي الآن` button opens the existing order and delivery system with product name, selected color, selected size, quantity, unit price and canonical product link already present. The customer is not asked to enter those product details again. Existing university/external delivery, pickup dates, cash/prepaid payment, transfer proof and WhatsApp behavior remain intact.

## Admin product detail management
Admins can add, edit and delete colors and sizes per product, define each color/size combination's stock and active state, upload/replace/reorder/remove multiple product images, update description/prices/discounts and control visibility. All changes persist in the managed database/storage and appear on the public site without code edits.

## University logo correction and management
Fix the Mansoura National University logo so it renders in university-selection cards and admin lists. For every university, allow either an uploaded image with pre-save preview, replace and clear controls, or an image URL with validation, preview, edit and clear controls. Persist the selected logo reference durably and keep the fallback monogram when a remote asset is unavailable.

## Compatibility and delivery
Preserve the current premium feminine Al Nada visual identity, Arabic RTL behavior, mobile/desktop responsiveness, secure admin login, orders/payments/delivery/WhatsApp flow and existing public/admin routes. Keep durable images out of Git, use managed storage paths, run additive migrations only, and do not break existing legacy products that have no variant rows.

## Previously delivered outcomes retained
The published admin system, products/categories/content management, order settings, four-university delivery configuration, payment review and hero/explainer media controls remain part of this release.
