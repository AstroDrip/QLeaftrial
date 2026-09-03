# QLeaves Exact Reference / No-AR Amendment

This amendment supersedes every visual-direction and augmented-reality requirement in `2026-09-03-qleaves-storefront-design.md`.

## Binding visual reference

`qleavessitedesign.html` (SHA-256 `2A1261AD348718E73E5D2A63D4489A0E58EDE744DABFE4EE25C9A57C124548474`) is the visual source of truth. The React frontend must reproduce its DOM composition, CSS measurements, responsive breakpoints, Fraunces/Archivo typography, colors, gradients, paper-rip geometry, counter animation, Three.js particle field, scroll-scrub timing, card-reveal timing, philosophy section, about section, and footer without design reinterpretation.

Permitted changes are limited to React component boundaries, event cleanup, accessible equivalents, QLeaves business copy, QAR currency, links required for the existing shop/cart/checkout/admin flows, and replacing hard-coded plant records with API data. These changes must not alter the reference layout, spacing, typography, palette, or animation behavior. Three.js is retained solely for the decorative hero particle field; it is not an AR feature.

Pages not depicted in the reference must reuse only its existing tokens and component grammar. They must not introduce a second design language or new decorative patterns.

## AR removal

The application must contain no AR functionality or AR-adjacent product-model functionality. Remove `<model-viewer>`, GLB/USDZ fields and files, model upload or attribution UI, AR copy, AR routes/components/tests/dependencies, `ArAsset` persistence, seed data, and public/admin API fields. Remove the planned AR implementation task and AR end-to-end/manual verification. Historical Git commits may retain prior text; the checked-out source and active documentation may not.

## Retained commerce scope

Retain the React/Vite storefront, Express API, local SQLite/PostgreSQL workflows, product catalogue, persistent guest cart, guest checkout, COD/external-payment-link choice, transactional server-authoritative order creation, secure admin sessions, product/inventory/order administration, local three-command startup, and end-to-end verification.

## Acceptance

The result is accepted when the public design matches the reference at desktop and mobile breakpoints, no checked-out source or active documentation contains product AR/model functionality, and the complete local commerce workflow passes automated tests and can be opened at the documented local URLs.
