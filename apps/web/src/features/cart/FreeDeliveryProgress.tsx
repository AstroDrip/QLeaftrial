import { useLayoutEffect, useRef } from "react";
import { useSiteLanguage } from "../../app/providers";
import { LeafIcon, SproutIcon } from "../../components/icons";
import { FREE_DELIVERY_THRESHOLD_QAR, freeDeliveryProgress, useFreeDeliveryStore } from "./free-delivery-store";
import "./FreeDeliveryProgress.css";

export { FREE_DELIVERY_THRESHOLD_QAR, freeDeliveryProgress };

const copy = {
  en: {
    label: "Free delivery progress",
    unlocked: "You’ve unlocked free delivery!",
    remaining: (amount: number) => `Add ${amount} QAR more to get free delivery`,
    note: `Free delivery on orders of ${FREE_DELIVERY_THRESHOLD_QAR} QAR or more`,
  },
  ar: {
    label: "التقدم نحو التوصيل المجاني",
    unlocked: "لقد حصلت على التوصيل المجاني!",
    remaining: (amount: number) => `أضف ${amount} ر.ق للحصول على توصيل مجاني`,
    note: `توصيل مجاني للطلبات من ${FREE_DELIVERY_THRESHOLD_QAR} ر.ق فأكثر`,
  },
} as const;

// How far the card closes in around the line before it leaves.
const CLOSE_IN_MARGIN_PX = 10;

// A banner card: a live message, a track that fills in the brand colour with a glowing light at its
// head, a seed at the start and a leaf pinned at the goal. When the goal is met the message holds for a
// moment, the text fades, the card closes in around the line and the line flies to the cart icon to
// become a ring around it (see FreeDeliveryFlyer). "compact" is the slimmer card above the floating cart.
export function FreeDeliveryProgress({ subtotalQar, compact = false }: { subtotalQar: number; compact?: boolean }) {
  const { language } = useSiteLanguage();
  const t = copy[language];
  const phase = useFreeDeliveryStore((state) => state.phase);
  const { remaining, percent, unlocked } = freeDeliveryProgress(subtotalQar);
  const card = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

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

  if (unlocked && phase === "done") return null;

  // A basket that has just reached the goal reads as "celebrate" even before the controller catches up.
  const stage = unlocked ? (phase === "progress" ? "celebrate" : phase) : "progress";
  const collapsing = stage === "collapse" || stage === "fly";
  const flying = stage === "fly";
  const shown = unlocked ? 100 : percent;

  return (
    <div className={`free-delivery-wrap${compact ? " free-delivery-wrap--compact" : ""}${flying ? " is-flying" : ""}`}>
      <div
        ref={card}
        className={`free-delivery${compact ? " free-delivery--compact" : ""}${stage !== "progress" ? " is-unlocked" : ""}${collapsing ? " is-collapsing" : ""}${flying ? " is-flying" : ""}`}
        data-testid="free-delivery"
        data-phase={stage}
      >
        <p className="free-delivery__message" role="status">{unlocked ? t.unlocked : t.remaining(remaining)}</p>
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
            <span className="free-delivery__glow" aria-hidden="true" />
          </div>
          <LeafIcon className="free-delivery__anchor free-delivery__anchor--goal" />
        </div>
        {compact ? null : <p className="free-delivery__note">{t.note}</p>}
      </div>
    </div>
  );
}
