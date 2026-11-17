import "./submission.css";
import { useEffect, useState } from "react";
import { whatsappLink } from "../../content/contact";
import { discardPendingOrder, retryNow, useOrderSubmission } from "./order-submission";
import { submissionCopy } from "./submission-copy";

/** Seconds until the next automatic attempt, updated every second. */
function useCountdown(target: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  return target ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
}

/**
 * Shown in place of "Place order" while an order is unconfirmed: what is happening, in plain words, and what the
 * customer can do. It never says the order was received; that is the confirmation page's job.
 */
export function OrderSubmissionPanel({ isArabic }: { isArabic: boolean }) {
  const t = submissionCopy[isArabic ? "ar" : "en"];
  const { phase, savedOn, nextAttemptAt } = useOrderSubmission();
  const seconds = useCountdown(phase === "waiting" ? nextAttemptAt : null);
  const [askingToStartOver, setAskingToStartOver] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Leaving the page would lose an order that exists only in this tab's memory.
  useEffect(() => {
    if (savedOn !== "memory" || (phase !== "confirming" && phase !== "waiting" && phase !== "sending")) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = t.leaveWarning; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [savedOn, phase, t.leaveWarning]);

  if (phase !== "confirming" && phase !== "waiting") return null;
  const waiting = phase === "waiting";
  const title = savedOn === "memory" && waiting ? t.notSavedTitle : waiting ? t.waitingTitle : t.confirmingTitle;
  const body = savedOn === "memory" && waiting ? t.notSavedBody : waiting ? t.waitingBody : t.confirmingBody;

  return (
    <div className={`order-submission order-submission--${waiting ? "waiting" : "confirming"}`} role="status" aria-live="polite" data-testid="order-submission" data-phase={phase} data-saved={savedOn ?? undefined}>
      <div className="order-submission__head">
        {waiting ? <span className="order-submission__icon" aria-hidden="true" /> : <span className="order-submission__spinner" aria-hidden="true" />}
        <h2>{title}</h2>
      </div>
      <p>{body}</p>
      {waiting ? (
        <>
          <p className="order-submission__next">{retrying ? t.nextTry(0) : t.nextTry(seconds)}</p>
          <div className="order-submission__actions">
            <button type="button" className="primary-button" disabled={retrying} onClick={async () => { setRetrying(true); try { await retryNow(); } finally { setRetrying(false); } }}>{t.retryNow}</button>
            <a className="button button--secondary" href={whatsappLink(t.whatsappMessage)} target="_blank" rel="noreferrer">{t.contact}</a>
          </div>
          {askingToStartOver ? (
            <div className="order-submission__start-over" role="group" aria-label={t.startOver}>
              <p>{t.startOverQuestion}</p>
              <div className="order-submission__actions">
                <button type="button" className="button button--secondary" onClick={() => setAskingToStartOver(false)}>{t.startOverNo}</button>
                <button type="button" className="button button--secondary" onClick={() => { setAskingToStartOver(false); void discardPendingOrder(); }}>{t.startOverYes}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="order-submission__link" onClick={() => setAskingToStartOver(true)}>{t.startOver}</button>
          )}
        </>
      ) : null}
    </div>
  );
}
