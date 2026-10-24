type UnknownRecord = Record<string, unknown>;

export type SafeCspReport = {
  documentUri?: string;
  blockedUri?: string;
  effectiveDirective?: string;
  disposition?: string;
  statusCode?: number;
};

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 2048 ? value : undefined;
}

function safeUri(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;

  try {
    const parsed = new URL(candidate);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return candidate.split(/[?#]/, 1)[0];
  }
}

function normalize(source: UnknownRecord): SafeCspReport {
  const status = source["status-code"] ?? source.statusCode;
  return {
    documentUri: safeUri(source["document-uri"] ?? source.documentURL),
    blockedUri: safeUri(source["blocked-uri"] ?? source.blockedURL),
    effectiveDirective: text(
      source["effective-directive"] ?? source.effectiveDirective,
    ),
    disposition: text(source.disposition),
    statusCode: typeof status === "number" && Number.isFinite(status)
      ? status
      : undefined,
  };
}

export function parseCspReports(body: unknown): SafeCspReport[] {
  if (typeof body !== "string") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry) => {
      const bodyRecord = record(record(entry)?.body);
      return bodyRecord ? [normalize(bodyRecord)] : [];
    });
  }

  const legacy = record(record(parsed)?.["csp-report"]);
  return legacy ? [normalize(legacy)] : [];
}
