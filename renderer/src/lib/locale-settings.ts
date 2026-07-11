import { readStorage, subscribeStorage, writeStorage } from "./storage";

export type SupportedLocale = "en" | "es" | "fr" | "ar" | "zh-Hans";

export type LocaleSettings = {
  locale: SupportedLocale;
  /** BCP 47 tag used by Intl */
  intlLocale: string;
};

const KEY = "benben.locale.settings.v1";

const LOCALE_MAP: Record<SupportedLocale, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  ar: "ar-SA",
  "zh-Hans": "zh-CN",
};

const DEFAULTS: LocaleSettings = {
  locale: "en",
  intlLocale: "en-US",
};

let cache = { ...DEFAULTS, ...readStorage(KEY, DEFAULTS) };

export function getLocaleSettings(): LocaleSettings {
  return cache;
}

export function setLocale(locale: SupportedLocale): LocaleSettings {
  cache = { locale, intlLocale: LOCALE_MAP[locale] ?? "en-US" };
  writeStorage(KEY, cache);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale === "ar" ? "ar" : locale.startsWith("zh") ? "zh" : locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }
  return cache;
}

export function subscribeLocaleSettings(fn: () => void): () => void {
  return subscribeStorage(KEY, () => {
    const stored = readStorage<LocaleSettings>(KEY, DEFAULTS);
    cache = { ...DEFAULTS, ...stored, intlLocale: LOCALE_MAP[stored.locale] ?? "en-US" };
    fn();
  });
}

export const SUPPORTED_LOCALES: { id: SupportedLocale; label: string; ready: boolean }[] = [
  { id: "en", label: "English", ready: true },
  { id: "es", label: "Español", ready: true },
  { id: "fr", label: "Français", ready: false },
  { id: "ar", label: "العربية", ready: false },
  { id: "zh-Hans", label: "简体中文", ready: false },
];
