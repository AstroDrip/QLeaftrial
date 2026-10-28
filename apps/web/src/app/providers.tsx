import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { localeContent, type SiteLanguage } from "../content/locales";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // A cold server can fail the first request or two; back off and try again before showing an error.
      retry: 2,
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
  deliveryFeeQar: number | null;
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ["storefront-settings"],
    queryFn: async (): Promise<StoreSettings> => {
      const response = await fetch("/api/v1/storefront/settings");
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
