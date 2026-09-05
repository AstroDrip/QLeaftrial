import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { useSiteLanguage } from "../app/providers";
import { Footer } from "./Footer";
import { SkipLink } from "./SkipLink";
import { SiteHeader } from "./SiteHeader";

export function Layout({ children }: { children?: ReactNode }) {
  const { isArabic } = useSiteLanguage();

  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main-content" className="main-content" dir={isArabic ? "rtl" : "ltr"} lang={isArabic ? "ar" : "en"}>
        {children ?? <Outlet />}
      </main>
      <Footer />
    </>
  );
}
