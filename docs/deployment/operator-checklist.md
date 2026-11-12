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
