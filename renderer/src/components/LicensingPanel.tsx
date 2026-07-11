import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Panel, Pill, erp, ErpFieldLabel } from "@/components/ui-bits";
import {
  activateLicense,
  getLicense,
  trialDaysRemaining,
  validateActivationKey,
} from "@/lib/license-store";

export function LicensingPanel() {
  const { t } = useTranslation();
  const lic = getLicense();
  const [key, setKey] = useState("");

  function onActivate() {
    const v = validateActivationKey(key);
    if (!v.ok) {
      toast.error(v.message);
      return;
    }
    try {
      activateLicense(key);
      toast.success(v.message);
      setKey("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activation failed");
    }
  }

  return (
    <Panel title={t("license.title")}>
      <p className="mb-4 text-sm text-muted-foreground">
        Commercial licensing is in preparation. Trial mode is active; online validation and payments are not enabled.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone={lic.mode === "activated" ? "success" : "brand"}>{lic.mode}</Pill>
        {lic.mode === "trial" && (
          <span className="text-sm text-muted-foreground">
            {t("license.trial")} — {t("license.daysLeft", { count: trialDaysRemaining() })}
          </span>
        )}
      </div>
      <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t("license.seats")}</dt>
          <dd>
            {lic.seatsUsed} / {lic.seatCount}
          </dd>
        </div>
        {lic.activatedAt && (
          <div>
            <dt className="text-muted-foreground">Activated</dt>
            <dd>{new Date(lic.activatedAt).toLocaleDateString()}</dd>
          </div>
        )}
      </dl>
      <label className="block max-w-md">
        <ErpFieldLabel>{t("license.activationKey")}</ErpFieldLabel>
        <input
          className={`mt-1 ${erp.input} font-mono`}
          placeholder="NXC-XXXX-XXXX-XXXX"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <button type="button" className={`mt-3 ${erp.actionBtn}`} onClick={onActivate}>
        {t("license.activate")}
      </button>
    </Panel>
  );
}
