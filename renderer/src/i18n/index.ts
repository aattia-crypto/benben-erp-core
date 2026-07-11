import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocaleSettings } from "@/lib/locale-settings";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import pt from "@/locales/pt.json";
import ko from "@/locales/ko.json";
import zh from "@/locales/zh.json";

const resources = {
  en: { translation: en },
  ar: { translation: ar },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  ko: { translation: ko },
  zh: { translation: zh },
};

export function initI18n(): void {
  const { locale } = getLocaleSettings();
  if (i18n.isInitialized) {
    void i18n.changeLanguage(locale);
    return;
  }
  void i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export default i18n;
