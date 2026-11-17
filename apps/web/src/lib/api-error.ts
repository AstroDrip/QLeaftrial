type PublicApiError = {
  error?: {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
    details?: unknown;
  };
};

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,80}$/;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly requestId?: string,
    public readonly status?: number,
    /** Facts the server sends with some answers (for example current prices after a price change). */
    public readonly details?: Record<string, unknown>,
  ) {
    // The request reference stays on the error object (for logs and admin screens); it is never part of the
    // message a customer may be shown.
    super(message);
    this.name = "ApiClientError";
  }
}

export async function errorFromResponse(response: Response): Promise<ApiClientError> {
  const body = await response.json().catch(() => ({})) as PublicApiError;
  const code = typeof body.error?.code === "string" ? body.error.code : undefined;
  const message = typeof body.error?.message === "string"
    ? body.error.message
    : `Request failed with ${response.status}`;
  const candidateRequestId = body.error?.requestId;
  const requestId = (code === "INTERNAL_SERVER_ERROR" || response.status >= 500) &&
      typeof candidateRequestId === "string" &&
      SAFE_REQUEST_ID.test(candidateRequestId)
    ? candidateRequestId
    : undefined;

  const details = body.error?.details && typeof body.error.details === "object" && !Array.isArray(body.error.details)
    ? body.error.details as Record<string, unknown>
    : undefined;
  return new ApiClientError(message, code, requestId, response.status, details);
}

