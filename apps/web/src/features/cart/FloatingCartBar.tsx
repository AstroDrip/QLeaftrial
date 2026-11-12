import { useEffect, useState, type RefObject } from "react";
import { useFreeDeliveryStore } from "./free-delivery-store";
import { Link, useLocation } from "react-router-dom";
import { useSiteLanguage, useStoreSettings } from "../../app/providers";
import { BagIcon } from "../../components/icons";
import { cartSubtotal, useCartStore } from "./cart-store";
import { FreeDeliveryProgress } from "./FreeDeliveryProgress";
import { FREE_DELIVERY_THRESHOLD_QAR } from "./free-delivery-store";

const HIDDEN_ON = /^\/(cart|checkout|order\/|invoice\/)/;

export type FloatingCartPlacement = { docked: boolean; footerHeight: number };

// Fixed near the viewport bottom while browsing; once the footer is on screen
// the bar docks just above it instead of covering footer content.
export function floatingCartStyle(placement: FloatingCartPlacement): { className: string; footerHeight?: string } {
  return placement.docked
    ? { className: "floating-cart floating-cart--docked", footerHeight: `${placement.footerHeight}px` }
    : { className: "floating-cart" };
}

function useFooterPlacement(footer: RefObject<HTMLElement | null>, active: boolean): FloatingCartPlacement {
  const [placement, setPlacement] = useState<FloatingCartPlacement>({ docked: false, footerHeight: 0 });
  useEffect(() => {
    const element = footer.current;
    if (!active || !element) return;
    const measure = () => setPlacement((current) => ({ ...current, footerHeight: element.offsetHeight }));
    measure();
    // Without IntersectionObserver the bar simply stays fixed.
    const visibility = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => setPlacement({ docked: entry.isIntersecting, footerHeight: element.offsetHeight }));
    visibility?.observe(element);
    const size = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    size?.observe(element);
    return () => { visibility?.disconnect(); size?.disconnect(); };
  }, [footer, active]);
  return placement;
}

// How long the customer can browse without changing the cart before the banner folds into its mini form.
export const MINI_AFTER_MS = 8000;

// The full banner shows when something is added or changed; after a stretch of browsing without touching the cart
// it folds into a mini banner (a small track on top of the round cart button, with the count badge), so it stays
// out of the way. Any cart change opens it again; hovering or focusing it opens it while the pointer or focus is on
// it. It never folds mid-celebration.
function useMiniBanner(signature: string, active: boolean) {
  const [mini, setMini] = useState(false);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    setMini(false);
    if (!active) return;
    const timer = window.setTimeout(() => setMini(true), MINI_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [signature, active]);
  const hold = {
    onPointerEnter: () => setHeld(true),
    onPointerLeave: () => setHeld(false),
    onFocus: () => setHeld(true),
    onBlur: () => setHeld(false),
  };
  return { mini: mini && !held, hold };
}

export function FloatingCartBar({ footer }: { footer: RefObject<HTMLElement | null> }) {
  const { isArabic } = useSiteLanguage();
  const { pathname } = useLocation();
  const settings = useStoreSettings();
  const items = useCartStore((state) => state.items);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  // Nothing to show for an empty cart: the header's cart icon is enough.
  const visible = count > 0 && (settings.data?.orderingEnabled ?? true) && !HIDDEN_ON.test(pathname);
  const total = cartSubtotal(items);
  const phase = useFreeDeliveryStore((state) => state.phase);
  const { mini, hold } = useMiniBanner(`${count}:${total}`, visible && (phase === "progress" || phase === "done"));
  const placement = useFooterPlacement(footer, visible);

  useEffect(() => {
    document.body.classList.toggle("has-floating-cart", visible);
    return () => document.body.classList.remove("has-floating-cart");
  }, [visible]);

  if (!visible) return null;
  const { className, footerHeight } = floatingCartStyle(placement);
  const label = (isArabic
    ? `فتح السلة، ${count} منتجات، المجموع ${total} ر.ق`
    : `Open cart, ${count} item${count === 1 ? "" : "s"}, total ${total} QAR`)
    + (total >= FREE_DELIVERY_THRESHOLD_QAR ? (isArabic ? "، توصيل مجاني" : ", free delivery unlocked") : "");

  return (
    <div className={`${className}${mini ? " floating-cart--mini" : ""}`} style={footerHeight ? { ["--footer-height" as string]: footerHeight } : undefined} data-state={mini ? "mini" : "full"} {...hold}>
      <FreeDeliveryProgress subtotalQar={total} compact mini={mini} />
      <Link to="/cart" className="floating-cart__button" aria-label={label} data-testid="floating-cart" data-fd-target="floating">
        <span className="floating-cart__icon">
          <BagIcon />
          <span className="floating-cart__badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>
        </span>
        <span className="floating-cart__total" aria-hidden="true"><span>{total} QAR</span></span>
      </Link>
    </div>
  );
}
