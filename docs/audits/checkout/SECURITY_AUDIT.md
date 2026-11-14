# Security audit (checkout scope)

No secrets, customer records or coordinates are reproduced here. Checks were made by reading the code and by probing
the isolated test database on 14 Nov 2026.

## Verified controls

| Control | Result |
| --- | --- |
| Admin routes require a session | All `/admin/*` routes answer 401 without the cookie (probed: orders, dashboard) |
| Session | Random 32-byte token, stored hashed, 7-day expiry, cookie `HttpOnly`, `SameSite=Lax`, `Secure` in production |
| Login | Argon2 password check; attempts limited per address; outage answers 503, not "invalid credentials" |
| Order pricing | Request carries product ids and quantities only; schema is strict |
| Order status and payment state | Cannot be set by a customer (probed: 400) |
| Other customers' orders | No public order lookup exists. The confirmation page uses data the browser already holds |
| Invoice links | Per-order HMAC token, constant-time comparison, rate limited; wrong or missing token → 404, same as an unknown order (probed) |
| Delivery coordinates | Returned only inside admin responses; absent from the public invoice (test) |
| SQL injection | All queries go through Prisma with parameters; no raw string SQL on the order path |
| XSS | React escapes all order text; no `dangerouslySetInnerHTML` on customer data. Sheet values are written `RAW`, so a name starting with `=` cannot become a formula (test) |
| Secrets in the browser bundle | The build verifier rejects `VITE_*` copies of server secrets; none found |
| `.env` files | Only `.env.example` is tracked in Git |
| Logs | Error handler logs names and codes, never bodies, cookies or connection strings |
| Geo endpoints | POST only, so addresses and coordinates stay out of URLs and logs |
| Location permission | Requested only when the customer presses the button; `watchPosition` is never used |

## Findings

| ID | Finding | Realistic impact | Severity |
| --- | --- | --- | --- |
| S1 | **Production dependency advisories** in `express` (via `body-parser`, `proxy-addr`, `qs`) and `compression`, each with a non-breaking fix. | Denial-of-service class issues on the public API | P1 |
| S2 | **Content-Security-Policy is report-only.** The policy exists and is collected, but browsers do not enforce it. | No second line of defence if an XSS bug is ever introduced | P2 |
| S3 | **No CSRF token or Origin check on admin changes.** Mitigated by `SameSite=Lax` (cross-site POST, PATCH and DELETE carry no cookie) and by JSON-only bodies. | Low today; an Origin check is cheap insurance | P2 |
| S4 | **Order response over-shares** internal fields to the customer who placed the order (API finding B6). | Minor information exposure; no other customer's data | P2 |
| S5 | **Admin actions are not attributed.** Any admin session can mark orders paid or change fees, and nothing records who did it. | Disputes cannot be traced | P2 |
| S6 | **Order rate limit is keyed by IP only** (API finding B7). | Legitimate shoppers behind a shared address can be blocked; an attacker with many addresses is not slowed | P2 |
| S7 | **Customer email is collected and never used** (no email is sent anywhere). | Holding personal data without a purpose; either use it (order emails) or stop requiring it | P3 |
| S8 | The Frankfurt database key that was pasted into a chat on 12 Nov has not been confirmed as revoked. | Old project's data readable with that key until revoked | Client action |

## Not found

No unauthenticated admin endpoint, no order enumeration, no IDOR (there is no customer-facing order-by-id route),
no secret in the repository, no unverified payment callback (there are no payment callbacks).
