# QLeaves Commerce, Admin, and SEO Design

## Status and scope

This design extends the verified `qleaves-reference-redesign` checkpoint. The binding visual source remains `qleavessitedesign.html`; its composition, palette, typography, responsive layout, Anime.js 3.2.1 choreography, and Three.js 0.128.0 particle field must not be reinterpreted.

The work makes password-only administration, product price/stock editing, cart actions, AR removal, and practical on-site SEO functional. External operational work such as Search Console, backlinks, Google Business Profile, DNS/SSL monitoring, review management, and uptime monitoring is explicitly excluded. Existing checkout and order-confirmation routes remain behaviorally unchanged.

## Authentication

The admin login form accepts only a password. `POST /api/v1/auth/login` accepts `{ password: string }`, verifies it with Argon2 against the single seeded development administrator, creates a random server-side session, and sets an HTTP-only `qleaves_admin` cookie. Session lookup and logout endpoints support route protection and explicit sign-out. The temporary password `taimuomar` appears only in backend seed/test code, never in browser source or responses.

The existing administrator email may remain as an internal unique database identifier, but email is not accepted, displayed, or transmitted by the authentication flow.

## Product administration and public data

Protected admin endpoints list products and patch `priceQar` and inventory `stock`. Both values are non-negative integers. A patch updates the Product and Inventory records in one database transaction and returns the persisted representation.

The admin table uses controlled integer inputs and debounced auto-save, flushes on blur, reports saving/saved/error state, and invalidates public product queries after success. Public product responses include integer `stock` in addition to `inStock`, so homepage counts/cards, shop cards, and product details reflect database updates after refresh or query invalidation.

## Cart

The repository has Zustand installed but no implemented cart store. A persisted store will be added with `addItem`, `setQuantity`, `removeItem`, and `clear`. Items retain product identity, display data, unit price, maximum known stock, and quantity. Add-to-cart controls appear on API-backed homepage, catalogue, and product-detail cards without changing the reference page's section order or animation hooks.

The existing cart page will consume this store instead of hard-coded items. Checkout and order-confirmation behavior will not be expanded in this change.

## AR removal

`arEnabled`, `ArAsset`, `arAsset`, `glbUrl`, `usdzUrl`, AR seed objects, and active API/admin/browser usage are removed. A new forward SQLite migration rebuilds Product without `arEnabled` and drops `ArAsset`; the historical initial migration remains untouched. PostgreSQL's current schema is updated for future `db push` deployments. Three.js remains exclusively inside the decorative homepage particle implementation.

## Footer and accessibility

The footer becomes a centered vertical stack while preserving the reference colors and typography. It includes “Founded in 2020,” an accessible Instagram icon linked to the supplied account, an accessible WhatsApp icon linked to `https://wa.me/97477551056`, and “Built by **QOZYD**” as the final row. Inline SVG icons are decorative inside links with explicit accessible labels.

Product controls have descriptive accessible names and disabled out-of-stock behavior. Product images retain meaningful alternative text, lazy loading where below the fold, asynchronous decoding, and CSS aspect-ratio containment to avoid layout shift. Heading levels remain sequential.

## SEO and delivery

The canonical production origin is `https://qleaves.qa`. The HTML shell supplies default title, description, canonical URL, Open Graph metadata, and Organization/LocalBusiness/WebSite JSON-LD. Route-aware metadata updates titles, descriptions, canonical URLs, robots directives, Open Graph values, and structured data for home, shop, product, cart, checkout, admin, and 404 views. Product pages emit Product/Offer structured data from live API records. The 404 route sets `noindex,follow`.

`robots.txt` allows public crawling, disallows `/admin/`, and identifies `https://qleaves.qa/sitemap.xml`. The sitemap includes stable public routes. Route components are lazy-loaded while the animation implementation remains unchanged. TanStack Query receives conservative defaults, public GET responses require revalidation, protected responses are `no-store`, and successful admin writes invalidate relevant product queries.

## Error handling and testing

All request bodies are validated with Zod and return the existing public API error shape. Invalid credentials return a generic 401. Missing/expired sessions return 401. Invalid product identifiers return 404, malformed price/stock values return 400, and persistence failures do not report success in the UI.

Development follows red-green-refactor cycles. API integration tests cover password-only login, cookie protection, logout, admin product reads/writes, integer validation, and public reflection of persisted changes. Web tests cover the password-only form, persisted cart behavior, add-to-cart entry points, admin auto-save, footer links/layout semantics, route metadata, product JSON-LD, and 404 noindex. Final verification runs Prisma generation, all tests, type checking, production builds, and an active-source AR search.

