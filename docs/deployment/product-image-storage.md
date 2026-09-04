# Product image storage

Production product images are stored in a public Supabase Storage bucket instead of PostgreSQL. PostgreSQL stores only the public object URL in `ProductMedia.url`.

## Supabase setup

1. Create a public Storage bucket named `product-images` (or choose another name and use it consistently).
2. Add these server-only variables to each Vercel environment that runs the API:

```text
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_PRODUCT_IMAGE_BUCKET=product-images
```

Projects that still use legacy JWT API keys may set `SUPABASE_SERVICE_ROLE_KEY` instead of `SUPABASE_SECRET_KEY`.

Never expose either server key through a `VITE_*` variable.

## Runtime behavior

- PNG, JPEG, WebP, and GIF data URLs are decoded and checked against their real file signatures.
- Decoded images larger than 2 MiB are rejected.
- SQLite development keeps the validated data URL so local development remains zero-configuration.
- PostgreSQL runtime uploads the decoded bytes to Supabase Storage and stores only the resulting public URL.
- If database product creation fails after an upload, the API attempts to delete that uploaded object. Cleanup failure is logged without replacing the original database error.

Existing Base64 product rows are not migrated by this change. They can be re-uploaded through the admin flow or migrated separately after deployment.
