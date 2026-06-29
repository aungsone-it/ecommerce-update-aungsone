// Language Context - non-English bundles loaded on demand to shrink initial bundle
import { useState, useEffect, useCallback, ReactNode } from "react";
import { useLocation } from "react-router";
import { Language, LanguageContext } from "./language-core";
import { enTranslations } from "./translations/en";

type TranslationMap = Record<string, string>;

export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [language, setLanguageState] = useState<Language>("en");
  const [zhMap, setZhMap] = useState<TranslationMap | null>(null);
  const [myMap, setMyMap] = useState<TranslationMap | null>(null);
  const isAdminRoute =
    location.pathname.startsWith("/admin") ||
    /\/admin(?:\/|$)/.test(location.pathname);
  const effectiveLanguage: Language = isAdminRoute && language === "my" ? "en" : language;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("migoo-language");
      if (saved === "en" || saved === "zh" || saved === "my") {
        setLanguageState(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("migoo-language", language);
    } catch {
      /* ignore */
    }
  }, [language]);

  useEffect(() => {
    if (effectiveLanguage !== "zh" || zhMap) return;
    let cancelled = false;
    void import("./translations/zh").then((mod) => {
      if (!cancelled) setZhMap(mod.zhTranslations as TranslationMap);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveLanguage, zhMap]);

  useEffect(() => {
    if (effectiveLanguage !== "my" || myMap) return;
    let cancelled = false;
    void import("./translations/my").then((mod) => {
      if (!cancelled) setMyMap(mod.myTranslations as TranslationMap);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveLanguage, myMap]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = useCallback(
    (key: string): string => {
      if (effectiveLanguage === "zh" && zhMap) {
        return zhMap[key] ?? enTranslations[key] ?? key;
      }
      if (effectiveLanguage === "my" && myMap) {
        return myMap[key] ?? enTranslations[key] ?? key;
      }
      return enTranslations[key] ?? key;
    },
    [effectiveLanguage, zhMap, myMap]
  );

  return (
    <LanguageContext.Provider value={{ language: effectiveLanguage, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export { useLanguage } from "./useLanguage";
