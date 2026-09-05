import type { ErrorRequestHandler } from "express";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: unknown }).status === 413
  ) {
    response.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "Payload too large" },
    });
    return;
  }

  const requestId =
    typeof response.locals.requestId === "string"
      ? response.locals.requestId
      : "unavailable";

  console.error(JSON.stringify({
    level: "error",
    requestId,
    method: request.method,
    pathname: request.path,
    error: {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
  }));

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      requestId,
    },
  });
};
