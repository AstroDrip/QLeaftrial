import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { localeContent, type SiteLanguage } from "../content/locales";

import { ApiClientError } from "../lib/api-error";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // Retry temporary 5xx and network failures with backoff; do not retry 4xx errors
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        if (error instanceof ApiClientError && error.status && error.status >= 400 && error.status < 500) {
          return false;
        }
        return true;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      refetchOnWindowFocus: false,
    },
  },
});

const defaultLanguage: SiteLanguage = "en";

const LanguageContext = createContext<{
  language: SiteLanguage;
  isArabic: boolean;
  content: typeof localeContent.en | typeof localeContent.ar;
  setLanguage: (language: SiteLanguage) => void;
}>({
  language: defaultLanguage,
  isArabic: false,
  content: localeContent.en,
  setLanguage: () => undefined,
});

export function useSiteLanguage() {
  return useContext(LanguageContext);
}

export function useSiteContent() {
  const { language } = useSiteLanguage();
  return localeContent[language];
}

export interface StoreSettings {
  orderingEnabled: boolean;
  commercialRegistration: string | null;
  ecommerceLicense: string | null;
  businessAddress: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ["storefront-settings"],
    queryFn: async (): Promise<StoreSettings> => {
      // Customers read the CDN-cached copy; inside admin the shop owner reads the live record, so a change
      // they just saved never appears to revert after a reload.
      const inAdmin = typeof window !== "undefined" && /^\/admin(\/(?!login)|$)/.test(window.location.pathname);
      const response = await fetch(inAdmin ? "/api/v1/admin/storefront-settings" : "/api/v1/storefront/settings");
      if (!response.ok) throw new Error(`Could not load storefront settings (${response.status})`);
      return response.json() as Promise<StoreSettings>;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function Providers({ children, client = queryClient }: { children: ReactNode; client?: QueryClient }) {
  const [language, setLanguage] = useState<SiteLanguage>(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("qleaves-language") : null;
    return stored === "ar" ? "ar" : defaultLanguage;
  });
  const isArabic = language === "ar";

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("qleaves-language", language);
    }

    const root = document.documentElement;
    root.lang = language;
    root.dir = isArabic ? "rtl" : "ltr";
    document.body.dir = isArabic ? "rtl" : "ltr";
    document.body.dataset.locale = language;
  }, [language, isArabic]);

  const value = useMemo(
    () => ({ language, isArabic, content: localeContent[language], setLanguage }),
    [language, isArabic],
  );

  return (
    <LanguageContext.Provider value={value}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </LanguageContext.Provider>
  );
}
