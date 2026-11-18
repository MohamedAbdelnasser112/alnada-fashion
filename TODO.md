# الندى | Al Nada — Delivery Extension Outcomes

## Admin visual refinement
Increase admin UI text weight and legibility, slightly enlarge icons, and improve spacing while preserving the existing premium RTL identity and responsive layout.

## Hero and explainer media controls
Allow admins to upload, replace, delete and preview the homepage Hero video, edit overlay text and buttons, and preserve autoplay, muted playback and looping. Add the same upload/replace/delete/preview capability for a payment-transfer explainer video with editable title and description.

## Delivery choice and university delivery
When the customer chooses “اطلبي الآن”, show university delivery and outside-university delivery. University delivery includes cards for Delta University, Mansoura National University, New Mansoura University and Horus University. Use official-source logo URLs where verified; keep each logo/name editable from the admin. Horus is faded, disabled and marked `COMING SOON`. The remaining active universities are selectable.

After a university selection, require full name, phone and an available pickup date. Available dates are controlled from the admin and only enabled dates appear to customers. Admins can add, edit, enable or disable dates and universities.

## Payments and order submission
Offer cash on delivery and prepaid payment. For prepaid payment, show the configured Digital Wallet and InstaPay number, provide copy buttons, explain that the customer must send the transfer image with order details, and keep payment status pending until admin review. Validate required fields, save the order to the real database first, then prepare a WhatsApp message to `01008814332` containing customer, product, product link, quantity, price, delivery method, university/address, pickup date and payment method. Open WhatsApp only after the save succeeds.

## Outside-university delivery
Collect full name, phone, detailed address and payment method. Save the same order metadata and prepare the same WhatsApp flow.

## Admin orders and settings
Show order number, customer data, product/link/quantity/price, delivery method, university/address, pickup date, payment method/status and order date. Support detail view, status changes, payment confirmation after review, cancellation/deletion, search/filtering and WhatsApp contact. Add settings for university CRUD, logos, active/coming-soon state, payment numbers, WhatsApp number, order message, explainer video, available dates, and toggles for university/external delivery.

## Existing delivered outcomes retained
The existing secure admin login, dashboard metrics, product/category CRUD, content CMS, server/database deployment, public catalog hydration and published routes remain in scope and must continue working.
