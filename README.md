# QLeaves

React storefront and Node.js/Express API for QLeaves Qatar.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run setup
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:3000` and Vite proxies `/api` requests to it. Admin sign-in is at `http://localhost:5173/admin/login`; the temporary local password is stored only in the API seed.

The default local database is SQLite at `apps/api/prisma/dev.db`. Product price and stock edits in the admin screen are written to that database immediately.

## Verify

```bash
npm run prisma:generate -w @qleaves/api
npm test
npm run typecheck
npm run build
```
