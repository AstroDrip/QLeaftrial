type PublicApiError = {
  error?: {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
  };
};

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,80}$/;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(
      code === "INTERNAL_SERVER_ERROR" && requestId
        ? `${message} Reference: ${requestId}`
        : message,
    );
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
  const requestId = code === "INTERNAL_SERVER_ERROR" &&
      typeof candidateRequestId === "string" &&
      SAFE_REQUEST_ID.test(candidateRequestId)
    ? candidateRequestId
    : undefined;

  return new ApiClientError(message, code, requestId);
}
