import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Panel, Pill, erp } from "@/components/ui-bits";
import { isDesktopShell } from "@/lib/desktop-api";
import {
  checkForUpdates,
  getCurrentAppVersion,
  type UpdateCheckResult,
} from "@/lib/update-service";
import { getUpdateSettings, type ReleaseChannel } from "@/lib/update-settings";

type SchedulerStatus = {
  schedulerRunning: boolean;
  channel: ReleaseChannel;
  lastCheck: UpdateCheckResult | null;
  nextCheckDueAt: string | null;
};

export function ReleaseManagementPanel() {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState<string>("…");
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const channel = getUpdateSettings().channel;

  useEffect(() => {
    void (async () => {
      setAppVersion(await getCurrentAppVersion());
      if (isDesktopShell() && window.benben?.update?.getStatus) {
        const statusRes = await window.benben.update.getStatus();
        if (statusRes.ok && statusRes.data) {
          setScheduler(statusRes.data as SchedulerStatus);
          if (statusRes.data.lastCheck) {
            setResult(statusRes.data.lastCheck as UpdateCheckResult);
          }
        }
      }
    })();
  }, []);

  async function onCheckNow() {
    setChecking(true);
    try {
      const check = await checkForUpdates(channel);
      setResult(check);
      if (!check.ok) {
        toast.error(check.error ?? t("settings.updateCheckFailed", { defaultValue: "Update check failed." }));
        return;
      }
      if (check.updateAvailable) {
        toast.message(t("settings.updateAvailable"));
      } else {
        toast.success(t("settings.upToDate", { defaultValue: "You are on the latest version." }));
      }
      if (isDesktopShell() && window.benben?.update?.getStatus) {
        const statusRes = await window.benben.update.getStatus();
        if (statusRes.ok && statusRes.data) {
          setScheduler(statusRes.data as SchedulerStatus);
        }
      }
    } finally {
      setChecking(false);
    }
  }

  const display = result;
  const latestVersion = display?.latest?.version ?? "—";

  return (
    <Panel title={t("settings.updates", { defaultValue: "Release Management" })}>
      <div className="flex items-start gap-2">
        <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.updatesHelp", {
              defaultValue:
                "Benben checks for new releases at startup and once per day. Downloads are manual — install the new build when you are ready.",
            })}
          </p>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t("settings.currentVersion", { defaultValue: "Installed version" })}</dt>
              <dd className="font-mono font-medium">{appVersion}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("settings.releaseChannel", { defaultValue: "Channel" })}</dt>
              <dd className="capitalize">{channel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("settings.latestRemote", { defaultValue: "Latest on channel" })}</dt>
              <dd className="font-mono">{latestVersion}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("settings.lastChecked", { defaultValue: "Last checked" })}</dt>
              <dd>
                {display?.checkedAt
                  ? new Date(display.checkedAt).toLocaleString()
                  : scheduler?.lastCheck?.checkedAt
                    ? new Date(scheduler.lastCheck.checkedAt).toLocaleString()
                    : "—"}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {display?.updateAvailable ? (
              <Pill tone="brand">{t("settings.updateAvailable")}</Pill>
            ) : display?.ok ? (
              <Pill tone="success">{t("settings.upToDate", { defaultValue: "Up to date" })}</Pill>
            ) : display?.error ? (
              <Pill tone="warning">{display.error}</Pill>
            ) : null}
            {scheduler?.schedulerRunning ? (
              <span className="text-xs text-muted-foreground">
                {t("settings.schedulerActive", { defaultValue: "Background checks active" })}
                {scheduler.nextCheckDueAt
                  ? ` · ${t("settings.nextCheck", { defaultValue: "Next due" })} ${new Date(scheduler.nextCheckDueAt).toLocaleString()}`
                  : ""}
              </span>
            ) : null}
          </div>

          {display?.latest?.releaseNotes ? (
            <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("settings.releaseNotes", { defaultValue: "Release notes" })}
              </div>
              <p className="whitespace-pre-wrap text-foreground">{display.latest.releaseNotes}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${erp.actionBtn} inline-flex items-center gap-2`}
              onClick={() => void onCheckNow()}
              disabled={checking || !isDesktopShell()}
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t("settings.checkUpdates")}
            </button>
            {display?.latest?.downloadUrl ? (
              <a
                href={display.latest.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className={`${erp.secondaryBtn} inline-flex items-center gap-2`}
              >
                <Download className="h-4 w-4" />
                {t("settings.downloadPrepare")}
              </a>
            ) : null}
          </div>

          {!isDesktopShell() ? (
            <p className="text-xs text-muted-foreground">
              {t("settings.updatesDesktopOnly", {
                defaultValue: "Update checks require the Benben desktop app.",
              })}
            </p>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
