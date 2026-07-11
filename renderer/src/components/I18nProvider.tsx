import { useEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { initI18n } from "@/i18n";
import { getLocaleSettings, setLocale, subscribeLocaleSettings } from "@/lib/locale-settings";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [, tick] = useState(0);

  useEffect(() => {
    initI18n();
    const loc = getLocaleSettings();
    document.documentElement.lang = loc.locale;
    document.documentElement.dir = loc.locale === "ar" ? "rtl" : "ltr";
    return subscribeLocaleSettings(() => {
      const next = getLocaleSettings();
      void i18n.changeLanguage(next.locale);
      document.documentElement.lang = next.locale;
      document.documentElement.dir = next.locale === "ar" ? "rtl" : "ltr";
      tick((n) => n + 1);
    });
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export { setLocale };
