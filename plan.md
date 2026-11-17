# الندى | Al Nada — Admin System Plan

## Product scope
Build a server-backed, Arabic RTL admin system separated from the public storefront:
- `/admin/login`: branded admin sign-in with email/username and password.
- `/admin`: authenticated dashboard for products, orders, categories, analytics and public content.
- Public `/`: reads editable content and catalog data from the server APIs so admin changes appear without code edits.

## Architecture
- **Server:** Node.js + Express serves the built Vite assets and JSON APIs.
- **Persistence:** Manus managed MySQL, enabled through the project server/database capabilities. Tables cover admin users, sessions, products, categories, orders/order items, customers and site content.
- **Authentication:** application-owned admin session with bcrypt password verification, opaque random session tokens hashed in the database, HttpOnly/Secure/SameSite=None cookie for embedded Preview compatibility, expiry and role checks. Admin credentials are supplied through protected project secrets, never committed to source.
- **Frontend:** preserve the existing public fashion page while adding a data hydration layer. Add a separate Vite admin entry at `/admin` with reusable dashboard shell, charts, tables, filters, forms and mobile layout.
- **Deployment:** container-backed server publication with a Dockerfile, health endpoint, and runtime route handling. The existing static build output is replaced by a server build contract.

## Admin capabilities
- Overview: products, orders, sales, customers, recent orders, best sellers and sales trend visualization.
- Products: create, edit, delete, visibility, featured state, category, sizes, colors, stock, prices, discount and image URL/upload surface.
- Categories: create, edit, delete, visibility and image.
- Orders: search/filter, view detail, update status, cancel and delete.
- Content: edit homepage hero/headings, promotional banner, announcement, About, contact, social links and offers.
- Public APIs: catalog and site settings endpoints consumed by the storefront.

## Design direction
- **Movement:** Cairo quiet-luxury editorial dashboard — warm paper surfaces, blush accents and restrained dark ink.
- **Core principles:** operational clarity, feminine restraint, one-glance hierarchy, confident whitespace.
- **Color philosophy:** cream and off-white backgrounds keep dense management surfaces calm; blush indicates brand actions and selected states; dark ink anchors data and navigational trust.
- **Layout paradigm:** persistent right sidebar with a roomy asymmetric workspace, stacked metric cards, wide data tables and contextual drawers rather than a generic centered grid.
- **Signature elements:** blush active rail, hairline dividers, soft cream cards, Arabic micro-labels paired with compact English utility labels.
- **Interaction:** safe, explicit actions with inline feedback, confirmation for destructive operations, optimistic-feeling but server-confirmed saves, and filter state preserved within each section.
- **Animation:** subtle 160–220ms fades and upward lifts only for route entry, cards and drawers; no distracting looping motion in admin.
- **Typography:** Cairo for Arabic UI and numbers with a compact neutral sans fallback for utility labels; strong page titles, quiet metadata and clear table density.
- **Brand essence:** a calm operations atelier for a premium women’s fashion house. Personality: precise, warm, composed.
- **Voice:** direct, polished and reassuring. Examples: “كل تفاصيل الندى في مكان واحد.” / “تم حفظ التغييرات وظهرت على المتجر.”
- **Wordmark:** preserve the existing الندى mark and pair it with a small “ATELIER / ADMIN” utility label.
- **Signature color:** muted blush `#b67a7a` used sparingly for active navigation and primary actions.

## Project structure
- `server/`: Express server, database connection/migrations, auth middleware, API routes and seed logic.
- `src/`: public storefront source and data hydration.
- `admin/`: separate admin HTML entry.
- `src/admin/`: admin application JavaScript and CSS.
- `public/`: durable static assets and route manifest.
- `Dockerfile`: production build and server entrypoint.
