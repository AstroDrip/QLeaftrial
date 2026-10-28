import { useSiteLanguage } from "../../app/providers";
import { LeafIcon, SproutIcon } from "../../components/icons";
import "./FreeDeliveryProgress.css";

// Orders of this size or more are delivered free. Smaller orders can still be placed.
export const FREE_DELIVERY_THRESHOLD_QAR = 150;

export function freeDeliveryProgress(subtotalQar: number) {
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD_QAR - subtotalQar);
  const percent = Math.min(100, Math.max(0, Math.round((subtotalQar / FREE_DELIVERY_THRESHOLD_QAR) * 100)));
  return { remaining, percent, unlocked: remaining === 0 };
}

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

// A banner card: a live message, a track that fills in the brand colour, a seed at the start and a
// leaf pinned at the goal. "compact" is the slimmer version used above the floating cart button.
export function FreeDeliveryProgress({ subtotalQar, compact = false }: { subtotalQar: number; compact?: boolean }) {
  const { language } = useSiteLanguage();
  const t = copy[language];
  const { remaining, percent, unlocked } = freeDeliveryProgress(subtotalQar);

  return (
    <div className={`free-delivery${compact ? " free-delivery--compact" : ""}${unlocked ? " is-unlocked" : ""}`} data-testid="free-delivery">
      <p className="free-delivery__message" role="status">{unlocked ? t.unlocked : t.remaining(remaining)}</p>
      <div className="free-delivery__rail">
        <SproutIcon className="free-delivery__anchor free-delivery__anchor--start" />
        <div
          className="free-delivery__track"
          role="progressbar"
          aria-label={t.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${subtotalQar} / ${FREE_DELIVERY_THRESHOLD_QAR} QAR`}
        >
          <span className="free-delivery__fill" style={{ width: `${percent}%` }} />
        </div>
        <LeafIcon className="free-delivery__anchor free-delivery__anchor--goal" />
      </div>
      {compact ? null : <p className="free-delivery__note">{t.note}</p>}
    </div>
  );
}
