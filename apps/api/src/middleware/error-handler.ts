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

// Prisma and pg report an unreachable, overloaded or timed-out database in several shapes. Any of these
// means "try again shortly", never "you did something wrong", so they become one 503 the storefront and
// admin can recognise (and never, for example, an "Invalid credentials" on the login page).
const DATABASE_UNAVAILABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"]);
const DATABASE_UNAVAILABLE_NAMES = new Set(["PrismaClientInitializationError", "PrismaClientRustPanicError"]);
const DATABASE_UNAVAILABLE_MESSAGES = [
  /timeout exceeded when trying to connect/i,
  /connection terminated/i,
  /connection refused/i,
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND/,
  /too many (clients|connections)/i,
  /Transaction already closed|Transaction API error/i,
  /Can't reach database server/i,
];

export function isDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, code, message } = error as { name?: unknown; code?: unknown; message?: unknown };
  if (typeof name === "string" && DATABASE_UNAVAILABLE_NAMES.has(name)) return true;
  if (typeof code === "string" && (DATABASE_UNAVAILABLE_CODES.has(code) || /^(ECONN|ETIMEDOUT|57P0|53300)/.test(code))) return true;
  return typeof message === "string" && DATABASE_UNAVAILABLE_MESSAGES.some((pattern) => pattern.test(message));
}

export const DATABASE_UNAVAILABLE_MESSAGE = "The shop is briefly unavailable. Please try again in a moment";

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const requestId =
    typeof response.locals.requestId === "string"
      ? response.locals.requestId
      : "unavailable";
  response.locals.errorCategory = "server";

  if (error instanceof ApiError) {
    response.locals.errorCategory = error.code;
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message, ...(error.statusCode >= 500 ? { requestId } : {}) },
    });
    return;
  }

  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: unknown }).status === 413
  ) {
    response.locals.errorCategory = "PAYLOAD_TOO_LARGE";
    response.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "Payload too large" },
    });
    return;
  }

  if (error && typeof error === "object" && (error as { type?: unknown }).type === "entity.parse.failed") {
    response.locals.errorCategory = "VALIDATION_ERROR";
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "The request body is not valid JSON" } });
    return;
  }

  const databaseDown = isDatabaseUnavailable(error);
  response.locals.errorCategory = databaseDown ? "DATABASE_UNAVAILABLE" : "INTERNAL_SERVER_ERROR";

  // Names, codes and messages only: never the request body, cookies or a connection string.
  console.error(JSON.stringify({
    level: "error",
    requestId,
    method: request.method,
    pathname: request.path,
    category: response.locals.errorCategory,
    error: {
      name: error instanceof Error ? error.name : typeof error,
      code: error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined,
      message: redact(error instanceof Error ? error.message : String(error)),
      stack: databaseDown ? undefined : error instanceof Error ? redact(error.stack ?? "") : undefined,
    },
  }));

  if (databaseDown) {
    response.setHeader("Retry-After", "5");
    response.status(503).json({
      error: { code: "DATABASE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE, requestId },
    });
    return;
  }

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      requestId,
    },
  });
};

// Database URLs can appear inside driver messages; strip any credentials before logging.
function redact(text: string): string {
  return text.replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1***@");
}
