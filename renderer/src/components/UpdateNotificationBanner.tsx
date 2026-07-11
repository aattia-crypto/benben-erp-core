import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Download } from "lucide-react";
import {
  checkForUpdates,
  dismissUpdateVersion,
  shouldNotifyUpdate,
  type UpdateCheckResult,
} from "@/lib/update-service";
import { getUpdateSettings } from "@/lib/update-settings";
import { isDesktopShell } from "@/lib/desktop-api";
import { erp } from "@/components/ui-bits";

export function UpdateNotificationBanner() {
  const { t } = useTranslation();
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    if (!isDesktopShell() || !getUpdateSettings().checkEnabled) return;
    void checkForUpdates().then((r) => {
      if (shouldNotifyUpdate(r)) setResult(r);
    });
  }, []);

  if (!result?.updateAvailable || !result.latest) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand/30 bg-brand/10 px-4 py-2 text-sm">
      <span>
        {t("settings.updateAvailable")} <strong>v{result.latest.version}</strong>
        {result.latest.releaseNotes ? ` — ${result.latest.releaseNotes}` : ""}
      </span>
      <div className="flex items-center gap-2">
        {result.latest.downloadUrl && (
          <a
            href={result.latest.downloadUrl}
            target="_blank"
            rel="noreferrer"
            className={`${erp.secondaryBtn} inline-flex items-center`}
          >
            <Download className="mr-1 h-3 w-3" />
            {t("settings.downloadPrepare")}
          </a>
        )}
        <button
          type="button"
          className="rounded p-1 hover:bg-surface"
          aria-label="Dismiss"
          onClick={() => {
            dismissUpdateVersion(result.latest!.version);
            setResult(null);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
