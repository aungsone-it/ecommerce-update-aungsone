// Language Context - Bilingual support (zh loaded on demand to shrink initial bundle)
import { useState, useEffect, useCallback, ReactNode } from "react";
import { Language, LanguageContext } from "./language-core";
import { enTranslations } from "./translations/en";

type TranslationMap = Record<string, string>;

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [zhMap, setZhMap] = useState<TranslationMap | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("migoo-language");
      if (saved === "en" || saved === "zh") {
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
    if (language !== "zh" || zhMap) return;
    let cancelled = false;
    void import("./translations/zh").then((mod) => {
      if (!cancelled) setZhMap(mod.zhTranslations as TranslationMap);
    });
    return () => {
      cancelled = true;
    };
  }, [language, zhMap]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = useCallback(
    (key: string): string => {
      if (language === "zh" && zhMap) {
        return zhMap[key] ?? enTranslations[key] ?? key;
      }
      return enTranslations[key] ?? key;
    },
    [language, zhMap]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export { useLanguage } from "./useLanguage";
