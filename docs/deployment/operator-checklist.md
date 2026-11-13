# Operator checklist (things only the shop owner can run)

These steps touch the live Supabase database or Vercel. Nothing here deletes data. Run them in VS Code's
terminal (PowerShell) from the project folder. Never paste the connection strings into a chat.

## 1. Before pushing the November 2026 reliability release

The new checkout sends a duplicate-order key that needs one new column. Add it **before** the new code goes
live. If the code goes live first, checkout still works; it just runs without duplicate protection until
the column exists.

```powershell
cd C:\Users\HP\Desktop\qleaves
$env:QLEAVES_DATABASE_PROVIDER = "postgresql"
$env:DATABASE_URL = Read-Host "Pooled connection string (port 6543)"
$env:DIRECT_URL = Read-Host "Direct connection string (port 5432)"
```

Find both strings in Supabase → Project Settings → Database → Connection string.

```powershell
npm run supabase:check
```

Read-only. Read the line starting with `RESULT:`.

- **"matches the baseline"**: carry on.
- **"missing some tables"**: usually the Review table was never added. Stop and send the output.
- **"not purely additive"**: stop and send the output.

```powershell
npm run supabase:baseline
npm run supabase:deploy
npm run supabase:status
```

`baseline` records the existing schema as the starting point. It is needed once only. `deploy` adds the
new column and index. `status` should end with "Database schema is up to date".

If the Hybrid Bougainvillea drafts are not in admin yet:

```powershell
npm run supabase:catalog
```

It only creates products that do not exist yet, as unpublished drafts.

Clear the secrets from the terminal:

```powershell
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL, Env:QLEAVES_DATABASE_PROVIDER
```

## 2. After the push (Vercel deploys automatically)

Open each address in a browser. Use your own domain if it differs.

| Address | Expected |
| --- | --- |
| `https://qleaves.qa/api/v1/health` | `{"status":"ok"}` |
| `https://qleaves.qa/api/v1/ready` | `{"status":"ready","database":"connected"}` |
| `https://qleaves.qa/api/v1/catalogue` | a list of your published products |
| `https://qleaves.qa/api/v1/reviews` | `{"items":[...]}` |
| `https://qleaves.qa/catalogue/catalogue.json` | the same products (written during the build) |

Then:

1. Sign in to admin. A wrong password should say "That password is not correct".
2. Edit a product price, then check the shop shows it within about a minute.
3. Place a test order with cash on delivery, then decline it in admin. The stock comes back.

## 3. Region check (once)

Look up the region in Supabase → Project Settings → General. The site's server runs in Mumbai (`bom1`), next to the Mumbai Supabase project (moved from Frankfurt on 12 November 2026).
If Supabase is somewhere else (for example Mumbai or Singapore), say so: moving the server next to the
database makes every page faster.

## 4. Before pushing the multilingual search (November 2026)

Search reads one new column, `searchAliases` (extra search words set in admin). Add it to the Mumbai
database **before** the code goes live: the new code asks for that column, so without it the shop's product
pages and search would fail. It is additive (one empty, nullable column); no existing data changes.

```powershell
cd C:\Users\HP\Desktop\qleaves
$env:QLEAVES_DATABASE_PROVIDER = "postgresql"
$env:DATABASE_URL = Read-Host "Mumbai pooled connection string (port 6543)"
$env:DIRECT_URL = Read-Host "Mumbai direct connection string (port 5432)"
npm run supabase:deploy
npm run supabase:status
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL, Env:QLEAVES_DATABASE_PROVIDER
```

`deploy` should apply `3_search_aliases`; `status` should end with "Database schema is up to date".

## 5. Before pushing the delivery-charge and sheet-status release (November 2026)

Orders now record whether their delivery charge is still to be confirmed (orders below 150 QAR), and whether
their row reached the Google Sheet. That needs migration `4_delivery_confirmation_sheet_sync` on the Mumbai
database **before** the code goes live. It only adds columns (with defaults or empty), so no order changes.
Run the same commands as section 4; `deploy` should apply `4_delivery_confirmation_sheet_sync`.

## 6. Turning on the Google Sheets invoice sync

The code is ready; it stays off until these four Vercel variables exist (Production scope only, so preview
deployments never write to the real sheet):

| Variable | What it is |
| --- | --- |
| `GOOGLE_SHEETS_ID` | The long id in the sheet's address, between `/d/` and `/edit` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the service account's JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` from the same JSON key, pasted as-is |
| `GOOGLE_SHEETS_TAB` | Optional, defaults to `Orders` (the tab and header row are created automatically) |

1. In Google Cloud (any project you own): enable the **Google Sheets API**, create a **service account**, and
   create a **JSON key** for it.
2. Create the spreadsheet and **share it with the service account's email as Editor**.
3. Add the variables in Vercel → Settings → Environment Variables (Production), then redeploy.
4. In admin → Orders, press **Sync all**. Only completed and paid orders are written, one row per order number
   (a retry updates that row, never adds a second). An order whose row failed shows "This order is not in the
   Google Sheet yet" with a **Retry** button. Never put the JSON key in chat, email or Git.

## 7. Before pushing the delivery map (November 2026)

Orders can now carry a confirmed delivery location. That needs migration `5_order_delivery_location` on the
Mumbai database **before** the code goes live (it adds one new table and one yes/no column; no existing data
changes). Run the same commands as section 4; `deploy` should apply `5_order_delivery_location`.

Nothing else is needed: the map file, fonts and address search ship with the site itself. See `docs/maps/README.md`.
