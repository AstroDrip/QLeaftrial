import { ApiClientError } from "./api-error";

// Turns any failure into a sentence a customer (or the shop owner) can act on, in their language.
// Technical details stay in the server logs; the request reference is kept so support can find them.

export type ErrorKind =
  | "offline"
  | "timeout"
  | "unavailable"
  | "rate-limited"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "invalid"
  | "server";

export function errorKind(error: unknown): ErrorKind {
  if (error instanceof ApiClientError) {
    const status = error.status ?? 0;
    if (error.code === "DATABASE_UNAVAILABLE" || error.code === "ORDERING_DISABLED" || status === 503 || status === 502 || status === 504) return "unavailable";
    if (status === 429) return "rate-limited";
    if (status === 401) return "unauthenticated";
    if (status === 403) return "forbidden";
    if (status === 404) return "not-found";
    if (status === 409) return "conflict";
    if (status >= 400 && status < 500) return "invalid";
    return "server";
  }
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || /timed out/i.test(error.message)) return "timeout";
    if (error instanceof TypeError || /failed to fetch|load failed|network|connection failed/i.test(error.message)) return "offline";
  }
  return "server";
}

const messages: Record<"en" | "ar", Record<ErrorKind, string>> = {
  en: {
    offline: "We couldn't reach QLeaves. Check your connection and try again.",
    timeout: "This is taking longer than usual. Please try again.",
    unavailable: "The shop is briefly unavailable. Please try again in a moment.",
    "rate-limited": "Too many attempts. Please wait a few minutes and try again.",
    unauthenticated: "Please sign in again.",
    forbidden: "You don't have access to this.",
    "not-found": "We couldn't find what you were looking for.",
    conflict: "Something changed while you were here. Please review and try again.",
    invalid: "Please check the details and try again.",
    server: "Something went wrong on our side. Please try again.",
  },
  ar: {
    offline: "تعذر الوصول إلى QLeaves. تحقق من اتصالك وحاول مجددًا.",
    timeout: "يستغرق الأمر وقتًا أطول من المعتاد. يُرجى المحاولة مرة أخرى.",
    unavailable: "المتجر غير متاح مؤقتًا. يُرجى المحاولة بعد لحظات.",
    "rate-limited": "محاولات كثيرة. يُرجى الانتظار بضع دقائق ثم المحاولة مجددًا.",
    unauthenticated: "يُرجى تسجيل الدخول مرة أخرى.",
    forbidden: "لا تملك صلاحية الوصول إلى هذا.",
    "not-found": "تعذر العثور على ما تبحث عنه.",
    conflict: "تغيّر شيء أثناء وجودك هنا. يُرجى المراجعة والمحاولة مجددًا.",
    invalid: "يُرجى التحقق من البيانات والمحاولة مجددًا.",
    server: "حدث خطأ من جهتنا. يُرجى المحاولة مرة أخرى.",
  },
};

// For conflicts and validation the server's own (English) message is more useful than a generic one:
// "Monstera is out of stock" tells the customer exactly what to change.
export function friendlyError(error: unknown, language: "en" | "ar"): string {
  const kind = errorKind(error);
  const serverDetail = error instanceof ApiClientError && (kind === "conflict" || kind === "invalid" || kind === "not-found")
    ? error.message
    : null;
  const reference = error instanceof ApiClientError && error.requestId ? error.requestId : null;
  const base = language === "en" && serverDetail ? `${serverDetail}.`.replace(/\.\.$/, ".") : messages[language][kind];
  return reference ? `${base} (${language === "ar" ? "المرجع" : "Reference"}: ${reference})` : base;
}
