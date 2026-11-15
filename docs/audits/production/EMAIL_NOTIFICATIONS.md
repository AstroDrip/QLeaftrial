# Order email notifications

Status: **IMPLEMENTED AND TESTED** locally (automated tests, plus one real send through Resend to Resend's own test
inbox). On the live site it is **IMPLEMENTED BUT REQUIRES CREDENTIALS**: database migration 6 and the Vercel
variables below.

## What happens when a customer places an order

1. Checkout is validated and the order, its items and its delivery location are saved in one database transaction.
2. In that same transaction a row is written to `NotificationOutbox` (`ORDER_CREATED`, key `order-created:<order id>`).
   The order and its notification record are saved together or not at all.
3. After the transaction commits, the request sends the email through Resend and waits for the answer (5 second
   limit). Nothing is left running after the response, because a Vercel function may be frozen once it answers.
4. The result is recorded on the row: `SENT` with Resend's message id, or the failure code and the next retry time.
5. The customer gets their order confirmation either way. An email failure never fails or delays an order beyond
   that 5 second limit.

## Status values

| Status | Meaning |
|---|---|
| `PENDING` | Waiting for its first send, or waiting for a retry |
| `SENDING` | Claimed by one worker right now |
| `SENT` | Accepted by Resend |
| `FAILED` | Given up: rejected by Resend, or 6 attempts used |
| `DISABLED` | Order emails were not set up when the order was placed; nothing is sent unless an admin presses "Send again" |

## Retries

- Failures that can pass (timeout, network, Resend 5xx, rate limit) are retried after 1 min, 5 min, 25 min, 2 h and
  10 h: 6 attempts in all. Then the row is `FAILED`.
- Failures that cannot pass by themselves (Resend 4xx: bad recipient, unverified sender, bad key) are `FAILED` at once.
- Two workers cannot send the same email: a worker must first change the row from `PENDING` to `SENDING` in one
  conditional update, and only one can. Resend is also given the same idempotency key on every attempt.
- A row stuck in `SENDING` for more than 2 minutes (its worker died) may be taken by another worker.

What triggers a retry:

| Trigger | When |
|---|---|
| An admin opens the orders page | Up to 2 due emails, 6 seconds at most |
| Vercel scheduled job (`vercel.json` `crons`) | Once a day at 03:00 UTC, up to 20 due emails |
| "Send again" on the order card | Immediately, for that one email |
| Any scheduler calling `GET /api/v1/internal/worker` with `Authorization: Bearer <CRON_SECRET>` | Whenever it is set up |

The scheduled job only runs if `CRON_SECRET` is set; without it the worker endpoint answers 401 to everyone.

## Events

| Event | Triggered | Today |
|---|---|---|
| `ORDER_CREATED` | Once, when the order is first saved. Never on an edit, a status change or a replayed checkout attempt | Active |
| `PAYMENT_VERIFIED` | When an online card payment is verified by a signed webhook | Template ready; triggered from the payment stage |
| `PAYMENT_FAILED` | When an online card payment fails | Template ready; triggered from the payment stage |
| `ORDER_CANCELLED` | Not triggered: the admin declines orders themselves, so an email to the admin adds nothing | Template ready, unused |

Marking an order paid by hand in admin does not send an email, for the same reason.

## Email content

Subject: `New order received: <order number> (QAR <total>)`, with "+ delivery" when the charge is still to be
confirmed. Body, as HTML with a plain-text copy: order number, date and time in Qatar time, customer name, phone
and email, each product with quantity, unit price and line total, merchandise subtotal, delivery charge (or "To be
confirmed with the customer", or "Free"), order total, payment method and status, delivery address, municipality,
area, zone, street, building, flat/floor, landmark, whether a map pin was confirmed, delivery notes, and a button
to the order in admin.

- Empty address parts are shown as "Not provided", never hidden.
- Customer-written text is HTML-escaped and marked `dir="auto"`, so Arabic and English each read correctly.
- No card data, tokens, idempotency keys or internal fields are included.

## Settings (server-only, never `VITE_*`)

| Variable | Required | Purpose |
|---|---|---|
| `EMAIL_PROVIDER_API_KEY` | yes | Resend API key |
| `ORDER_NOTIFICATION_EMAIL` | yes | The shop inbox that receives order emails |
| `EMAIL_FROM` | no | Sender. Default `QLeaves Orders <onboarding@resend.dev>` |
| `PUBLIC_SITE_URL` | no | Base of the admin link. Default `https://qleaves.qa` |
| `CRON_SECRET` | for the daily job | At least 16 random characters; Vercel sends it to its own scheduled jobs |

With `EMAIL_PROVIDER_API_KEY` or `ORDER_NOTIFICATION_EMAIL` unset the shop works as before and each order records
`DISABLED`.

## Sender and DNS

Resend's shared sender `onboarding@resend.dev` needs no DNS, but Resend only delivers from it to the address that
owns the Resend account. That is enough while the shop inbox is that address. To send from `orders@qleaves.qa`, or
to other addresses: add the domain in Resend (Domains, Add Domain), copy the MX, SPF (TXT) and DKIM (TXT) records
it shows into the domain's DNS, press Verify, then set `EMAIL_FROM`.

## Admin

Each order card shows "Order email sent", "waiting to be sent", "was not delivered" with a **Send again** button, or
"Order emails are not set up". `GET /api/v1/admin/notifications?status=FAILED` lists failed emails.

## Tests (`apps/api/tests/notifications.test.ts`, 9 tests)

Sent once with the right content; Arabic content and missing-field marking; provider down then retry succeeds;
timeout; rejected address is not retried; gives up after 6 attempts; three workers at once send one email; admin
sees a failure and retries it; not set up means nothing is sent; the worker endpoint needs the secret.

Automated tests can only ever use a fake key: the test setup blanks the real variables and the mail client refuses
any key not starting with `re_test_` while tests run.

## Found and fixed while building this

- The "send after" time was stamped by the database clock while the due check used the server clock. A small
  difference between the two could hold back the first send. Both now use the server clock.
- Prisma loads `apps/api/.env` when its client starts, which handed the developer's real key to the test run. One
  full API test run on 2026-11-15 therefore sent test emails through the real Resend account to Resend's own test
  inbox (`delivered@resend.dev`). No real person was emailed. It did use part of that day's free quota.

## Not verified

- Delivery into the shop's real Gmail inbox (no email has been sent to it).
- The Vercel daily job, and the limit on scheduled jobs on Vercel's free plan.
- Behaviour on the live site: migration 6 is not applied yet and nothing is pushed.
