import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { localeContent, type SiteLanguage } from "../content/locales";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
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

export function Providers({ children }: { children: ReactNode }) {
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </LanguageContext.Provider>
  );
}
