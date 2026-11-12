import { useEffect, useRef, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { useSiteLanguage } from "../app/providers";
import { prefetchLikelyRoutes } from "../app/route-modules";
import { FloatingCartBar } from "../features/cart/FloatingCartBar";
import { FreeDeliveryFlyer } from "../features/cart/FreeDeliveryFlyer";
import { Footer } from "./Footer";
import { SkipLink } from "./SkipLink";
import { SiteHeader } from "./SiteHeader";

export function Layout({ children }: { children?: ReactNode }) {
  const { isArabic } = useSiteLanguage();
  const footer = useRef<HTMLElement>(null);

  useEffect(prefetchLikelyRoutes, []);

  return (
    <div className="page-root">
      <SkipLink />
      <SiteHeader />
      <main id="main-content" className="main-content" dir={isArabic ? "rtl" : "ltr"} lang={isArabic ? "ar" : "en"}>
        {children ?? <Outlet />}
      </main>
      <FloatingCartBar footer={footer} />
      <FreeDeliveryFlyer />
      <Footer ref={footer} />
    </div>
  );
}
