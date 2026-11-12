import { useLayoutEffect, useRef, useState } from "react";
import { useSiteLanguage } from "../../app/providers";
import { LeafIcon, SproutIcon } from "../../components/icons";
import { FREE_DELIVERY_THRESHOLD_QAR, freeDeliveryProgress, useFreeDeliveryStore } from "./free-delivery-store";
import "./FreeDeliveryProgress.css";

export { FREE_DELIVERY_THRESHOLD_QAR, freeDeliveryProgress };

// The message is a lead that changes ("Add 50 QAR more to get" -> "You've unlocked") and a subject that stays
// ("free delivery"), which gains a "!" once the goal is met.
const copy = {
  en: {
    label: "Free delivery progress",
    subject: "free delivery",
    unlockedLead: "You’ve unlocked",
    remainingLead: (amount: number) => `Add ${amount} QAR more to get`,
    note: `Free delivery on orders of ${FREE_DELIVERY_THRESHOLD_QAR} QAR or more`,
  },
  ar: {
    label: "التقدم نحو التوصيل المجاني",
    subject: "توصيل مجاني",
    unlockedLead: "لقد حصلت على",
    remainingLead: (amount: number) => `أضف ${amount} ر.ق للحصول على`,
    note: `توصيل مجاني للطلبات من ${FREE_DELIVERY_THRESHOLD_QAR} ر.ق فأكثر`,
  },
} as const;

// How far the card closes in around the line before it leaves.
const CLOSE_IN_MARGIN_PX = 10;

// A banner card: a live message, a track that fills in the brand colour with a glowing light at its
// head, a seed at the start and a leaf pinned at the goal. When the goal is met the message holds for a
// moment, the text fades, the card closes in around the line and the line flies to the cart icon to
// become a ring around it (see FreeDeliveryFlyer). "compact" is the slimmer card above the floating cart.
export function FreeDeliveryProgress({ subtotalQar, compact = false, idle = false, placement = "page" }: { subtotalQar: number; compact?: boolean; idle?: boolean; placement?: "page" | "summary" }) {
  const { language } = useSiteLanguage();
  const t = copy[language];
  const phase = useFreeDeliveryStore((state) => state.phase);
  const { remaining, percent, unlocked } = freeDeliveryProgress(subtotalQar);
  const card = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const remainingLead = useRef<HTMLSpanElement>(null);
  const unlockedLead = useRef<HTMLSpanElement>(null);
  const [leadWidth, setLeadWidth] = useState<number | undefined>(undefined);

  // The two leads sit on top of each other and cross-fade. The box around them eases to the width of whichever
  // is showing, so the whole message stays centred before, during and after the change.
  useLayoutEffect(() => {
    const showing = (unlocked ? unlockedLead : remainingLead).current;
    if (!showing) return;
    const measure = () => {
      const width = showing.getBoundingClientRect().width;
      setLeadWidth(width > 0 ? Math.ceil(width) : undefined);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(showing);
    return () => observer?.disconnect();
  }, [unlocked, remaining, language]);

  // Measured as the card starts to close so it can shrink to exactly wrap the line.
  useLayoutEffect(() => {
    if (phase !== "collapse" || !card.current || !track.current) return;
    const outer = card.current.getBoundingClientRect();
    const line = track.current.getBoundingClientRect();
    const inset = (name: string, value: number) => card.current!.style.setProperty(name, `${Math.max(0, Math.round(value))}px`);
    inset("--fd-top", line.top - outer.top - CLOSE_IN_MARGIN_PX);
    inset("--fd-right", outer.right - line.right - CLOSE_IN_MARGIN_PX);
    inset("--fd-bottom", outer.bottom - line.bottom - CLOSE_IN_MARGIN_PX);
    inset("--fd-left", line.left - outer.left - CLOSE_IN_MARGIN_PX);
  }, [phase]);

  // In the cart summary the reached state stays put (lit line, "You've unlocked free delivery!"): it sits beside
  // the total it describes, so it never flies away. Elsewhere the line celebrates, flies to the cart and is gone.
  const settles = placement === "summary";
  if (unlocked && phase === "done" && !settles) return null;

  // A basket that has just reached the goal reads as "celebrate" even before the controller catches up.
  const stage = unlocked ? (settles || phase === "progress" ? "celebrate" : phase) : "progress";
  const collapsing = stage === "collapse" || stage === "fly";
  const flying = stage === "fly";
  const shown = unlocked ? 100 : percent;

  return (
    <div className={`free-delivery-wrap${compact ? " free-delivery-wrap--compact" : ""}${placement === "summary" ? " free-delivery-wrap--summary" : ""}${flying ? " is-flying" : ""}`}>
      <div
        ref={card}
        className={`free-delivery${compact ? " free-delivery--compact" : ""}${idle ? " free-delivery--idle" : ""}${placement === "summary" ? " free-delivery--summary" : ""}${stage !== "progress" ? " is-unlocked" : ""}${collapsing ? " is-collapsing" : ""}${flying ? " is-flying" : ""}`}
        data-testid="free-delivery"
        data-phase={stage}
      >
        <p className="free-delivery__message">
          {/* Assistive technology gets the whole sentence once; the two leads below are only for the eye. */}
          <span className="sr-only" role="status">{`${unlocked ? t.unlockedLead : t.remainingLead(remaining)} ${t.subject}${unlocked ? "!" : ""}`}</span>
          <span className="free-delivery__lead" style={leadWidth === undefined ? undefined : { width: leadWidth }} aria-hidden="true">
            <span ref={remainingLead} className="free-delivery__lead-text free-delivery__lead-text--remaining">{t.remainingLead(remaining)}</span>
            <span ref={unlockedLead} className="free-delivery__lead-text free-delivery__lead-text--unlocked">{t.unlockedLead}</span>
          </span>
          <span className="free-delivery__subject" aria-hidden="true">{t.subject}<span className="free-delivery__bang">!</span></span>
        </p>
        <div className="free-delivery__rail">
          <SproutIcon className="free-delivery__anchor free-delivery__anchor--start" />
          <div className="free-delivery__trackwrap" style={{ ["--fd-progress" as string]: `${shown}%` }}>
            <div
              ref={track}
              className="free-delivery__track"
              data-fd-track=""
              role="progressbar"
              aria-label={t.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={shown}
              aria-valuetext={`${subtotalQar} / ${FREE_DELIVERY_THRESHOLD_QAR} QAR`}
            >
              <span className="free-delivery__fill" style={{ width: `${shown}%` }} />
            </div>
            <span className="free-delivery__sweep" data-testid="free-delivery-sweep" aria-hidden="true" />
            <span className="free-delivery__glow" aria-hidden="true" />
          </div>
          <LeafIcon className="free-delivery__anchor free-delivery__anchor--goal" />
        </div>
        {compact ? null : (
          <p className="free-delivery__note">
            {placement === "summary" ? (
              <span aria-hidden="true">
                <span className="free-delivery__figures" dir="ltr">{Math.min(subtotalQar, FREE_DELIVERY_THRESHOLD_QAR)} / {FREE_DELIVERY_THRESHOLD_QAR} QAR</span>{" · "}
              </span>
            ) : null}
            {t.note}
          </p>
        )}
      </div>
    </div>
  );
}
