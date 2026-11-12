import { useEffect, useState, type RefObject } from "react";
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

export function FloatingCartBar({ footer }: { footer: RefObject<HTMLElement | null> }) {
  const { isArabic } = useSiteLanguage();
  const { pathname } = useLocation();
  const settings = useStoreSettings();
  const items = useCartStore((state) => state.items);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  // An empty cart is an idle state, not a reason to hide the cart: the bar shrinks to the cart button with a
  // small empty track above it, and opens out again as soon as something is added.
  const visible = (settings.data?.orderingEnabled ?? true) && !HIDDEN_ON.test(pathname);
  const idle = count === 0;
  const placement = useFooterPlacement(footer, visible);

  useEffect(() => {
    document.body.classList.toggle("has-floating-cart", visible);
    document.body.classList.toggle("has-floating-cart--idle", visible && idle);
    return () => document.body.classList.remove("has-floating-cart", "has-floating-cart--idle");
  }, [visible, idle]);

  if (!visible) return null;
  const total = cartSubtotal(items);
  const { className, footerHeight } = floatingCartStyle(placement);
  const label = idle
    ? (isArabic ? "فتح السلة، السلة فارغة" : "Open cart, your cart is empty")
    : (isArabic
      ? `فتح السلة، ${count} منتجات، المجموع ${total} ر.ق`
      : `Open cart, ${count} item${count === 1 ? "" : "s"}, total ${total} QAR`)
      + (total >= FREE_DELIVERY_THRESHOLD_QAR ? (isArabic ? "، توصيل مجاني" : ", free delivery unlocked") : "");

  return (
    <div className={`${className}${idle ? " floating-cart--idle" : ""}`} style={footerHeight ? { ["--footer-height" as string]: footerHeight } : undefined} data-state={idle ? "idle" : "active"}>
      <FreeDeliveryProgress subtotalQar={total} compact idle={idle} />
      <Link to="/cart" className="floating-cart__button" aria-label={label} data-testid="floating-cart" data-fd-target="floating">
        <span className="floating-cart__icon">
          <BagIcon />
          {idle ? null : <span className="floating-cart__badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
        </span>
        <span className="floating-cart__total" aria-hidden="true"><span>{total} QAR</span></span>
      </Link>
    </div>
  );
}
