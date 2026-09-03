# QLeaves Storefront Design

## Purpose

QLeaves is a Qatar-based home and office plant storefront. The first release will combine an editorial, motion-led shopping experience with a conventional catalogue, guest checkout, and a secure internal administration area. Selected products will support phone-based augmented reality through Google `<model-viewer>`.

## Initial Scope

The first implementation includes:

- A responsive React storefront in English.
- A scroll-driven homepage inspired by the pacing and editorial character of Produx, adapted into an original QLeaves identity.
- A searchable and filterable plant catalogue.
- Product detail pages with images, care information, price, stock status, and optional 3D/AR presentation.
- A browser-persistent shopping cart.
- Guest checkout without customer accounts.
- Pay-on-delivery and external-payment-link choices. The website does not process payments.
- Order creation and confirmation.
- A secure Node.js administration area for products, inventory, media, AR assets, and order statuses.
- Seeded sample products and simulated local order creation for the initial demo.

The initial implementation excludes product variants, finalized delivery-fee rules, customer accounts, live customer notifications, automated payment links, and on-site payment processing. These features can be designed later without changing the main boundaries described here.

## Visual Direction

The experience will use Produx as a reference for editorial scale, typographic contrast, pinned composition, image-fragment transitions, cinematic reveals, and scroll pacing. QLeaves will not reproduce Produx branding, copy, imagery, or proprietary assets.

The homepage will use an oversized QLeaves wordmark, compact monospace metadata, generous negative space, and scroll-linked plant imagery. Fragmented plant images will assemble into a complete hero composition. Featured plants will receive pinned, full-width reveals before the page transitions into a calmer catalogue interface. The 3D and AR feature will be introduced as a central product benefit.

The approved color system is:

- Deep olive `#263126` for primary dark backgrounds.
- Forest olive `#3F5138` for panels and interactive states.
- Moss `#748568` for secondary accents.
- Sage `#A8B59D` for borders and muted surfaces.
- Warm ivory `#F1EFE5` for light text and backgrounds.
- Soft sand `#D8D0BC` for product-information surfaces.
- Restrained terracotta `#B66F4A` for important alerts or actions.

The layout will move between deep-olive storytelling sections and warm-ivory commerce sections. Cinematic motion will be concentrated on the homepage; catalogue, product, cart, checkout, and admin screens will prioritize clarity and speed.

Produx uses At Aero and DM Mono. DM Mono may be used subject to its open font license. At Aero will only be used if the project has an appropriate webfont license; otherwise the implementation will select a legally distributable geometric display typeface with a similar tone.

## Technical Architecture

The repository will contain separate React and Node.js applications:

- The frontend is React with Vite.
- The backend is Node.js with Express.
- The production database is PostgreSQL, accessed through Prisma ORM.
- The local demo may use SQLite through Prisma so it runs without cloud credentials.
- Production product images and 3D models live in S3-compatible object storage behind a CDN; the database stores their metadata and URLs.
- The frontend communicates with a versioned REST API.
- GSAP ScrollTrigger provides the homepage scroll sequences.
- Google `<model-viewer>` provides 3D viewing and supported-device AR entry points.

The storefront and API are independently deployable. Shared contracts define request and response shapes without coupling UI components to database internals.

## Local Development Experience

The complete demo must run locally without Supabase, PostgreSQL, S3, or any other cloud account. The repository root will provide documented commands to install dependencies, prepare and seed the local database, and start both applications together. The default local URLs will be:

- Storefront: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Admin: `http://localhost:5173/admin`

The local environment will use a file-based SQLite database through Prisma, local media files, sample administrator credentials documented specifically for development, seeded plant products, and the supplied GLB demo asset. A root development command will start the React and Node.js processes concurrently, while separate commands remain available for debugging each application. Environment-variable examples will distinguish local defaults from production-only secrets.

## Application Modules

### Storefront

The storefront owns the homepage, catalogue, search and filters, product details, AR viewer, cart, checkout, and order confirmation. The cart persists in local browser storage until checkout succeeds.

### Administration

The administration area owns staff authentication, the dashboard, product editing, inventory, image and model metadata, and order-status management. It is not accessible through customer authentication because the first release has no customer accounts.

### API

The Express API exposes versioned routes for products, catalogue queries, order creation, admin authentication, admin product management, inventory changes, uploads, and order management. Administrative routes require authenticated staff sessions.

### Persistence and Storage

The core data model contains admin users, products, product media, AR assets, inventory, orders, and order items. Uploaded binaries are stored outside the database. In production, image and model URLs should be served from a CDN with appropriate cache headers.

## Storefront and Order Flow

1. A visitor enters through the motion-led homepage.
2. The visitor browses or filters the plant catalogue.
3. A product page displays its photos, price, stock, care information, and AR control when a model exists.
4. The visitor adds one or more items to the persistent cart.
5. Guest checkout collects name, phone, email, Qatar address, and optional delivery notes.
6. The customer chooses pay on delivery or payment link.
7. The API reloads authoritative products, recalculates prices, and checks stock in a transaction.
8. The API creates an unpaid order and returns a unique order number.
9. The confirmation screen presents the order number, summary, and next-payment-step explanation.
10. Staff progress the order through confirmed, awaiting payment, paid or COD, preparing, out for delivery, and delivered states.

For payment-link orders, staff may associate an external payment URL with the order. Automated transmission of that URL is not part of the initial implementation.

## AR Behavior

Only products with configured AR assets display the AR action. `<model-viewer>` loads the GLB lazily when the product viewer becomes relevant. Supported Android devices can use WebXR or Scene Viewer; supported iPhones can use Quick Look with generated USDZ output or a dedicated USDZ asset added later.

If AR is unsupported, the interactive 3D viewer remains available. If the model cannot load, the product page shows a retry state and retains all normal purchasing controls. Loading progress is visible, and models are never fetched for an entire catalogue page.

The initial demo uses `C:\Users\HP\Downloads\house_plant.glb`. It is a self-contained glTF 2.0 asset licensed CC BY 4.0 and requires attribution to Lahcen.el. At approximately 22.4 MB and 360,824 triangles, it is acceptable for a proof of concept but not a production catalogue target. Production models should have real-world scale baked into the asset and normally target approximately 3–8 MB with materially reduced geometry.

## Security and Validation

- Admin authentication uses server-side sessions stored in secure, HTTP-only cookies.
- Passwords are stored only as modern salted password hashes.
- Administrative mutations require authentication and appropriate authorization.
- Checkout data is validated on the server.
- Browser-supplied prices and stock values are never trusted.
- Order creation recalculates prices and checks stock transactionally.
- Uploads enforce permitted file types, size limits, generated object names, and private admin-only mutation routes.
- Secrets and infrastructure credentials are provided through environment variables and are never committed.

## Error Handling and Accessibility

Failed checkout submissions preserve the cart and entered data where safe. API errors use consistent codes and user-readable messages. Model failures, unsupported AR, missing images, and out-of-stock changes have explicit fallback states.

The storefront supports keyboard navigation, visible focus states, semantic controls, sufficient contrast, useful alternative text, and responsive touch targets. It respects `prefers-reduced-motion`; scroll-linked sequences become simple, nonessential fades or static compositions. Core shopping tasks never depend on animation.

## Testing

Automated tests cover:

- API input validation and authorization.
- Product and catalogue queries.
- Server-authoritative price and stock calculations.
- Transactional order creation.
- Cart persistence and calculations.
- Checkout validation and failure recovery.
- Admin route protection.
- AR viewer fallback behavior.
- Reduced-motion behavior for critical interactions.

End-to-end tests cover catalogue-to-confirmation and admin order-management paths. Manual verification covers responsive layouts, scroll choreography, desktop 3D viewing, and Android/iPhone AR after an HTTPS deployment is available.

## Success Criteria

The initial demo succeeds when a developer can follow the README from a clean checkout, start the entire application locally, and open the storefront and admin area at the documented URLs. A visitor can then experience the approved QLeaves visual direction, browse seeded plants, open a product, interact with the supplied 3D plant, add it to a cart, complete a simulated guest checkout, and receive an order number. An authenticated administrator must be able to manage the seeded catalogue and progress the resulting order. Failure and reduced-motion paths must preserve the ability to shop.
