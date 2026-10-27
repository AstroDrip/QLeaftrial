# QLeaves

React storefront and Node.js/Express API for QLeaves Qatar.

## Run locally

Requirements: Node.js 24 and npm.

```bash
npm install
npm run setup
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:3000` and Vite proxies `/api` requests to it. Admin sign-in is at `http://localhost:5173/admin/login`; the temporary local password is stored only in the SQLite development seed. PostgreSQL production seeding requires an operator-supplied password.

The default local database is SQLite at `apps/api/prisma/dev.db`. Product price and stock edits in the admin screen are written to that database immediately.

## Qatar storefront setup

The admin dashboard's **Business details and delivery** section stores the business registration and license identifiers, registered address, customer-service contacts, and the delivery charge. Enter verified business details before launch. Customers see the configured delivery charge at checkout; checkout is unavailable until a non-negative QAR delivery charge is saved. The same charge currently applies to Doha, Al Rayyan, Al Wakrah, and Al Khor.

The site supports Arabic and English and uses `https://qleaves.qa` as its canonical domain. A deployment owner must verify domain registration and valid HTTPS. The current payment-link option does not integrate or verify a Qatar-licensed payment gateway; arrange and validate a compliant provider separately. Website changes do not establish regulatory compliance; confirm licensing, agricultural requirements, disclosures, and policy wording with official Qatar authorities or a qualified adviser.

## Deploy

Vercel and Supabase setup, environment variables, database initialization,
custom-domain/DNS setup, and deployment health checks are documented in
[`docs/deployment/vercel-supabase.md`](docs/deployment/vercel-supabase.md).

## Verify

```bash
npm run prisma:generate -w @qleaves/api
npm test
npm run typecheck
npm run build
```
