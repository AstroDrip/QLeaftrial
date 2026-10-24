import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { useSiteLanguage } from "../app/providers";

type RecoveryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
};

type ReloadPage = () => void;

const staleChunkPatterns = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function isStaleChunkError(error: unknown): boolean {
  const message = errorMessage(error);
  return staleChunkPatterns.some((pattern) => pattern.test(message));
}

export function attemptStaleChunkRecovery(
  error: unknown,
  storage: RecoveryStorage,
  reload: ReloadPage,
): boolean {
  if (!isStaleChunkError(error)) return false;

  const message = errorMessage(error);
  const chunkUrl = message.match(/https?:\/\/\S+\/assets\/\S+\.js(?:\?\S*)?/i)?.[0] ?? message;
  const recoveryKey = `qleaves:stale-chunk-reload:${chunkUrl}`;

  try {
    if (storage.getItem(recoveryKey)) return false;
    storage.setItem(recoveryKey, "attempted");
  } catch {
    return false;
  }

  reload();
  return true;
}

export function RouteErrorContent({ error }: { error: unknown }) {
  const { isArabic } = useSiteLanguage();
  const staleChunk = isStaleChunkError(error);

  useEffect(() => {
    attemptStaleChunkRecovery(
      error,
      window.sessionStorage,
      () => window.location.reload(),
    );
  }, [error]);

  return (
    <main className="page-shell" id="main-content">
      <p className="eyebrow">QLeaves</p>
      <h1>{staleChunk ? (isArabic ? "جارٍ تحديث QLeaves" : "Updating QLeaves") : (isArabic ? "حدث خطأ ما" : "Something went wrong")}</h1>
      <p>
        {staleChunk
          ? (isArabic ? "يتوفر إصدار أحدث من المتجر. حدّث الصفحة للمتابعة." : "A newer version of the shop is available. Refresh to continue.")
          : (isArabic ? "تعذر تحميل هذه الصفحة. يرجى تحديثها والمحاولة مجددًا." : "We couldn't load this page. Please refresh and try again.")}
      </p>
      <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
        {isArabic ? "تحديث QLeaves" : "Refresh QLeaves"}
      </button>
    </main>
  );
}

export function RouteErrorPage() {
  return <RouteErrorContent error={useRouteError()} />;
}
