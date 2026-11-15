// Sends one email through Resend's HTTP API. Server-only: the key is read from the environment at call time and
// is never logged, returned or placed in an error.
export type EmailMessage = { to: string; subject: string; html: string; text: string; idempotencyKey: string };
export type EmailResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: EmailErrorCode; retryable: boolean; detail?: string };
export type EmailErrorCode = "NOT_CONFIGURED" | "TIMEOUT" | "NETWORK" | "RATE_LIMITED" | "REJECTED" | "PROVIDER_ERROR";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const EMAIL_TIMEOUT_MS = 5_000;
const DEFAULT_FROM = "QLeaves Orders <onboarding@resend.dev>";

export type EmailSettings = { apiKey: string; from: string; recipient: string };

/** The email settings, or null when order emails are not set up on this server. */
export function emailSettings(): EmailSettings | null {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim();
  const recipient = process.env.ORDER_NOTIFICATION_EMAIL?.trim();
  if (!apiKey || !recipient) return null;
  // Automated tests may only ever use a fake key, whatever is in a developer's local .env.
  if (process.env.VITEST && !apiKey.startsWith("re_test_")) return null;
  return { apiKey, recipient, from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM };
}

export async function sendEmail(message: EmailMessage, timeoutMs = EMAIL_TIMEOUT_MS): Promise<EmailResult> {
  const settings = emailSettings();
  if (!settings) return { ok: false, code: "NOT_CONFIGURED", retryable: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
        // The same notification retried is the same email: the provider drops a repeat instead of sending twice.
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({ from: settings.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: controller.signal,
    });
    if (response.ok) {
      const body = await response.json().catch(() => null) as { id?: unknown } | null;
      return { ok: true, providerMessageId: typeof body?.id === "string" ? body.id : null };
    }
    if (response.status === 429) return { ok: false, code: "RATE_LIMITED", retryable: true };
    // 4xx: the request itself is wrong (bad address, unverified sender, bad key). Retrying the same request cannot help.
    if (response.status >= 400 && response.status < 500) return { ok: false, code: "REJECTED", retryable: false };
    return { ok: false, code: "PROVIDER_ERROR", retryable: true };
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
    // Only the system's short error code (for example ENOTFOUND) is kept for the log, never the message.
    const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
    const detail = typeof cause === "string" && /^[A-Z0-9_]{3,40}$/.test(cause) ? cause : undefined;
    return { ok: false, code: aborted ? "TIMEOUT" : "NETWORK", retryable: true, ...(detail ? { detail } : {}) };
  } finally {
    clearTimeout(timer);
  }
}
