import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const REQUEST_TIMEOUT_MS = 8_000;
const REFRESH_MARGIN_MS = 60_000;

export type ServiceAccount = { email: string; privateKey: string };

type CachedToken = { value: string; expiresAt: number; email: string };
let cached: CachedToken | null = null;

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

// Vercel and .env files store the key on one line with literal "\n" sequences.
export function normalizePrivateKey(value: string): string {
  return value.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

export function signServiceAccountJwt(account: ServiceAccount, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: account.email, scope: SCOPE, aud: TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.privateKey);
  return `${header}.${claims}.${base64url(signature)}`;
}

export async function getAccessToken(account: ServiceAccount, now = Date.now()): Promise<string> {
  if (cached && cached.email === account.email && cached.expiresAt - REFRESH_MARGIN_MS > now) return cached.value;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signServiceAccountJwt(account, now) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new SheetsError("GOOGLE_AUTH_FAILED", response.status);

  const body = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") throw new SheetsError("GOOGLE_AUTH_FAILED", response.status);
  const lifetimeSeconds = typeof body.expires_in === "number" ? body.expires_in : 3600;
  cached = { value: body.access_token, expiresAt: now + lifetimeSeconds * 1000, email: account.email };
  return cached.value;
}

export function resetGoogleTokenCache(): void {
  cached = null;
}

// Carries only a code and HTTP status: Google error bodies can echo spreadsheet or customer data.
export class SheetsError extends Error {
  constructor(public readonly code: string, public readonly status?: number) {
    super(status ? `${code} (${status})` : code);
    this.name = "SheetsError";
  }
}
