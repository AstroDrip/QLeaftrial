import { useEffect, useState, type RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSiteLanguage, useStoreSettings } from "../../app/providers";
import { BagIcon } from "../../components/icons";
import { cartSubtotal, useCartStore } from "./cart-store";

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
  const visible = count > 0 && (settings.data?.orderingEnabled ?? true) && !HIDDEN_ON.test(pathname);
  const placement = useFooterPlacement(footer, visible);

  useEffect(() => {
    document.body.classList.toggle("has-floating-cart", visible);
    return () => document.body.classList.remove("has-floating-cart");
  }, [visible]);

  if (!visible) return null;
  const total = cartSubtotal(items);
  const { className, footerHeight } = floatingCartStyle(placement);
  const label = (isArabic
    ? `فتح السلة، ${count} منتجات، المجموع ${total} ر.ق`
    : `Open cart, ${count} item${count === 1 ? "" : "s"}, total ${total} QAR`);

  return (
    <div className={className} style={footerHeight ? { ["--footer-height" as string]: footerHeight } : undefined}>
      <Link to="/cart" className="floating-cart__button" aria-label={label} data-testid="floating-cart">
        <BagIcon />
        <span className="floating-cart__total" aria-hidden="true">{total} QAR</span>
      </Link>
    </div>
  );
}
