import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Footer } from "./Footer";
import { SkipLink } from "./SkipLink";
import { SiteHeader } from "./SiteHeader";

export function Layout({ children }: { children?: ReactNode }) {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main-content" className="main-content">
        {children ?? <Outlet />}
      </main>
      <Footer />
    </>
  );
}
