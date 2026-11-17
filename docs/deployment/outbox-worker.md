# Outbox worker: order emails and Google Sheet rows

The order email and the order's Google Sheet row are not done inside the customer's or the admin's request. They are
written as jobs to the `NotificationOutbox` table in the same database transaction as the order (or the order change),
and the answer is sent as soon as that transaction commits.

## Who runs the jobs

| Trigger | When | What |
|---|---|---|
| Head start after the answer | Right after an order is placed or changed | That order's jobs (Vercel keeps the function alive for it) |
| Admin opens the orders page | Each visit | Up to 5 due jobs, after the page has its data |
| Vercel scheduled job | Once a day, 03:00 UTC (`vercel.json`) | Up to 20 due jobs |
| Supabase `pg_cron` (recommended, set up below) | Every minute | Up to 20 due jobs |
| Admin "Send again" / "Retry sheet" | When pressed | That one job |

The head start is only a speed-up. A job is safe in the database from the moment the order is saved; if a head start
is cut short, the next run of any trigger finishes it. Without the `pg_cron` trigger, a failed email or sheet update
waits for the next admin visit or the daily job.

## Guarantees

- **At least once, never a visible duplicate.** A worker claims a job with a 2-minute lease. If it stops (a crash, a
  frozen function) the lease runs out and another worker takes the job. Emails carry the same provider idempotency key
  on every attempt; sheet rows are keyed by order number. A job done twice therefore delivers one email and writes
  one row.
- **Only the lease holder records a result.** A slow worker that lost its lease cannot overwrite the result of the
  worker that took over, or a newer change.
- **Sheet rows follow the order as it is now.** One sheet job per order; every change sets it waiting again, and the
  worker writes the current state. Late, repeated or out-of-order changes end with the right row. If a change arrives
  while that order's row is being written, the new run waits for that lease to end (at most 2 minutes).
- **Retries:** after 1 min, 5 min, 25 min, 2 h, 10 h; then `FAILED`, visible in admin with a retry button. Requests
  that cannot succeed (an email address the provider rejects) fail at once.
- **The business rule is unchanged:** the sheet lists completed and paid orders only, without customer email
  addresses. "Sync all orders now" still reconciles the whole sheet.

## Setting up the one-minute trigger in Supabase (not yet done)

Needs: `CRON_SECRET` set in Vercel (at least 16 random characters), and the extensions `pg_cron` and `pg_net`
enabled in the Supabase dashboard (Database, Extensions). I have not been able to confirm from here that both are
available on this project's plan; the dashboard shows it.

Run in the Supabase SQL editor, replacing the placeholder with the same value as `CRON_SECRET`. The secret is stored
in Supabase Vault, not in the job's text:

```sql
select vault.create_secret('PASTE-THE-CRON-SECRET-HERE', 'qleaves_cron_secret');

select cron.schedule(
  'qleaves-outbox-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://qleaves.qa/api/v1/internal/worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'qleaves_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
```

To check it: `select * from cron.job_run_details order by start_time desc limit 5;`
To stop it: `select cron.unschedule('qleaves-outbox-worker');`

Each call is one short request to the site (about 1,440 a day). With nothing due it reads one index and returns.

## Tests

- `apps/api/tests/outbox-worker.test.ts`: order answered while the email provider hangs; a worker that died after
  the provider accepted is recovered with the same idempotency key; a worker that lost its lease cannot record over
  the new holder; an admin change is answered while Google hangs; only due jobs run, and they survive a restart.
- `apps/api/tests/order-sheet.test.ts`: sheet rows through the worker, Google failing, Google not configured.
- `apps/api/tests/pg/orders-postgresql.test.ts`: five workers on separate PostgreSQL connections over the same six
  jobs send six emails, one per order.
