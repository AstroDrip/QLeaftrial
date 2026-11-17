// Work that should start as soon as a response is on its way (sending the order email, updating the Google Sheet),
// without making the customer or the admin wait for it.
//
// This is a head start only, never the guarantee: every such job is first written to the database outbox, and the
// scheduled worker finishes anything a head start did not (a serverless function can be frozen once it answers).
// On Vercel the job is handed to the platform's waitUntil, through the same request-context hook the official
// @vercel/functions package reads, so the function stays alive until it ends. Elsewhere it simply runs.
type RequestContext = { get?: () => { waitUntil?: (promise: Promise<unknown>) => void } | undefined };

const running = new Set<Promise<unknown>>();

export function afterResponse(label: string, work: () => Promise<unknown>): void {
  const job = new Promise<void>((resolve) => setImmediate(resolve))
    .then(work)
    .catch((error: unknown) => {
      console.error(JSON.stringify({ level: "error", event: "after-response-failed", job: label, name: error instanceof Error ? error.name : "unknown" }));
    });
  running.add(job);
  void job.finally(() => running.delete(job));
  try {
    const context = (globalThis as Record<symbol, RequestContext | undefined>)[Symbol.for("@vercel/request-context")];
    context?.get?.()?.waitUntil?.(job);
  } catch {
    // Not on Vercel, or the hook changed: the job still runs, and the scheduled worker covers it either way.
  }
}

/** For tests and graceful shutdown: waits until every started job has finished. */
export async function settleBackgroundWork(): Promise<void> {
  while (running.size) await Promise.allSettled([...running]);
}
