# Product image storage

Production product images use direct, signed uploads to a public Supabase Storage bucket. PostgreSQL stores only finalized public URLs and image metadata (`width`, `height`, and `purpose`); image bytes never pass through the Vercel Function.

## Supabase setup

1. Create a dedicated public bucket named `product-images` (or set a different exact name in `SUPABASE_PRODUCT_IMAGE_BUCKET`).
2. Restrict browser writes: do not add an anonymous insert/update/delete policy. The API creates short-lived, object-specific signed upload tokens with its server credential.
3. Set these server-only variables in every Vercel environment that runs the API:

```text
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_PRODUCT_IMAGE_BUCKET=product-images
```

Legacy projects may use `SUPABASE_SERVICE_ROLE_KEY` instead of `SUPABASE_SECRET_KEY`. Never expose either key, database URLs, or `RATE_LIMIT_SALT` through a `VITE_*` variable.

## Upload and finalization flow

1. The admin browser converts the selected image into catalogue and detail WebP variants and records their dimensions.
2. The authenticated API authorizes each variant and returns an object-specific Supabase signed upload target. Supabase signed-upload tokens expire after two hours.
3. The browser uploads each WebP directly to the staging prefix in Storage.
4. Product creation submits only staging paths and trusted metadata—not file bytes or signed tokens.
5. The API validates ownership, prefix, purpose, MIME type, dimensions, and object existence, then moves both variants to their final product prefix and writes the database rows.
6. If database creation fails, the API attempts compensating removal of finalized objects. Staged objects are also removed after success.

The catalogue and product detail render responsive sources using stored dimensions. PostgreSQL product creation rejects the legacy Base64 path. SQLite development retains a validated Base64 compatibility path so local development remains zero-configuration.

## Verification

In a non-production environment, create a product with one image and confirm:

- the browser sends image bytes to the signed Supabase URL, not `/api`;
- two WebP objects appear under the product prefix;
- the API response and a refreshed public catalogue expose both variants and dimensions;
- the page chooses responsive images without stretching and includes meaningful alt text;
- an expired, altered, cross-user, or non-staging path cannot be finalized.

Do not paste signed URLs or service credentials into logs or issue reports. Storage response bodies are intentionally excluded from application logs.
