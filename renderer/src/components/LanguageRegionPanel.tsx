import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Panel, erp, ErpFieldLabel } from "@/components/ui-bits";
import {
  SUPPORTED_LOCALES,
  getLocaleSettings,
  setLocale,
  type SupportedLocale,
} from "@/lib/locale-settings";
import i18n from "@/i18n";

export function LanguageRegionPanel() {
  const { t, i18n: i18nInstance } = useTranslation();
  const current = getLocaleSettings().locale;

  async function onChange(locale: SupportedLocale) {
    setLocale(locale);
    await i18n.changeLanguage(locale);
    toast.success(
      locale === "es" ? "Idioma actualizado." : "Language updated.",
    );
  }

  return (
    <Panel title={t("settings.languageRegion")}>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.languageRegionHint")}</p>
      <label className="block max-w-xs">
        <ErpFieldLabel>Language</ErpFieldLabel>
        <select
          className={`mt-1 ${erp.input}`}
          value={current}
          onChange={(e) => void onChange(e.target.value as SupportedLocale)}
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <option key={loc.id} value={loc.id} disabled={!loc.ready}>
              {loc.label}
              {!loc.ready ? " (coming soon)" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-muted-foreground">
        Active: {i18nInstance.language} · Intl: {getLocaleSettings().intlLocale}
      </p>
    </Panel>
  );
}
