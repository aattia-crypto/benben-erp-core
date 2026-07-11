import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel, erp, ErpFieldLabel } from "@/components/ui-bits";
import { useBranding } from "@/components/BrandingProvider";
import type { BrandingDto } from "@/lib/branding-types";
import { DEFAULT_ACCENT_COLOR, DEFAULT_PRODUCT_SUBTITLE } from "@/lib/branding-types";
import {
  applyAccentColor,
  isDesktopBranding,
  loadBranding,
  saveBranding,
} from "@/lib/branding-bridge";

function emptyForm(): BrandingDto {
  return {
    companyName: "",
    tagline: "",
    productSubtitle: DEFAULT_PRODUCT_SUBTITLE,
    invoicePrefix: "",
    accentColor: DEFAULT_ACCENT_COLOR,
    reportHeader: { line1: "", line2: "", line3: "" },
    documentFooter: "Thank you for your business.",
    logoDataUrl: null,
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "USA",
    },
    contact: { phone: "", email: "", taxId: "" },
    fiscal: { baseCurrency: "USD", taxRegion: "US", fiscalYearStartMonth: 1 },
    updatedAt: "",
  };
}

export function BrandingSettingsPanel() {
  const { refresh: refreshBrandingContext } = useBranding();
  const [form, setForm] = useState<BrandingDto>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingLogoDataUrl, setPendingLogoDataUrl] = useState<string | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    void loadBranding().then((dto) => {
      if (!cancelled) {
        setForm(dto);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    const payload = {
      companyName: form.companyName,
      tagline: form.tagline,
      productSubtitle: form.productSubtitle,
      invoicePrefix: form.invoicePrefix,
      accentColor: form.accentColor,
      reportHeader: form.reportHeader,
      documentFooter: form.documentFooter,
      address: form.address,
      contact: form.contact,
      fiscal: form.fiscal,
      ...(pendingLogoDataUrl !== undefined ? { logoDataUrl: pendingLogoDataUrl } : {}),
    };
    const res = await saveBranding(payload);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setForm(res.data);
    setPendingLogoDataUrl(undefined);
    applyAccentColor(res.data.accentColor);
    await refreshBrandingContext();
    toast.success(
      isDesktopBranding()
        ? "Company branding saved to AppData config."
        : "Company branding saved locally.",
    );
  }

  function onLogo(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setForm({ ...form, logoDataUrl: dataUrl });
      setPendingLogoDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <Panel title="Company branding">
        <p className="text-sm text-muted-foreground">Loading branding settings…</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Company branding">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Company / legal name</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Tagline</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            />
          </label>
          <label className="block">
            <ErpFieldLabel>Product subtitle</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              value={form.productSubtitle}
              onChange={(e) => setForm({ ...form, productSubtitle: e.target.value })}
              placeholder={DEFAULT_PRODUCT_SUBTITLE}
            />
          </label>
          <label className="block">
            <ErpFieldLabel>Invoice prefix</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input} font-mono uppercase`}
              value={form.invoicePrefix}
              onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
              placeholder="ACM"
              maxLength={8}
            />
          </label>
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Accent color (CSS)</ErpFieldLabel>
            <div className="mt-1 flex gap-2">
              <input
                className={`flex-1 ${erp.input} font-mono text-xs`}
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                placeholder={DEFAULT_ACCENT_COLOR}
              />
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded-md border border-border bg-surface p-1"
                value={form.accentColor.startsWith("#") ? form.accentColor : "#6366f1"}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                title="Pick accent color"
              />
            </div>
          </label>
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Report header lines</ErpFieldLabel>
            <div className="mt-1 space-y-2">
              <input
                className={erp.input}
                value={form.reportHeader.line1}
                onChange={(e) =>
                  setForm({
                    ...form,
                    reportHeader: { ...form.reportHeader, line1: e.target.value },
                  })
                }
                placeholder="Line 1 — company name"
              />
              <input
                className={erp.input}
                value={form.reportHeader.line2}
                onChange={(e) =>
                  setForm({
                    ...form,
                    reportHeader: { ...form.reportHeader, line2: e.target.value },
                  })
                }
                placeholder="Line 2 — address"
              />
              <input
                className={erp.input}
                value={form.reportHeader.line3}
                onChange={(e) =>
                  setForm({
                    ...form,
                    reportHeader: { ...form.reportHeader, line3: e.target.value },
                  })
                }
                placeholder="Line 3 — tax ID or tagline"
              />
            </div>
          </label>
          <label className="block">
            <ErpFieldLabel>Address</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              value={form.address.line1}
              onChange={(e) =>
                setForm({ ...form, address: { ...form.address, line1: e.target.value } })
              }
            />
          </label>
          <label className="block">
            <ErpFieldLabel>City / State / ZIP</ErpFieldLabel>
            <div className="mt-1 flex gap-2">
              <input
                className={erp.input}
                value={form.address.city}
                onChange={(e) =>
                  setForm({ ...form, address: { ...form.address, city: e.target.value } })
                }
                placeholder="City"
              />
              <input
                className={`${erp.input} w-16`}
                value={form.address.state}
                onChange={(e) =>
                  setForm({ ...form, address: { ...form.address, state: e.target.value } })
                }
                placeholder="ST"
              />
              <input
                className={erp.input}
                value={form.address.postalCode}
                onChange={(e) =>
                  setForm({ ...form, address: { ...form.address, postalCode: e.target.value } })
                }
                placeholder="ZIP"
              />
            </div>
          </label>
          <label className="block">
            <ErpFieldLabel>Phone</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              value={form.contact.phone}
              onChange={(e) =>
                setForm({ ...form, contact: { ...form.contact, phone: e.target.value } })
              }
            />
          </label>
          <label className="block">
            <ErpFieldLabel>Email</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              type="email"
              value={form.contact.email}
              onChange={(e) =>
                setForm({ ...form, contact: { ...form.contact, email: e.target.value } })
              }
            />
          </label>
          <label className="block">
            <ErpFieldLabel>Tax ID</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              value={form.contact.taxId}
              onChange={(e) =>
                setForm({ ...form, contact: { ...form.contact, taxId: e.target.value } })
              }
            />
          </label>
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Document footer</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              value={form.documentFooter}
              onChange={(e) => setForm({ ...form, documentFooter: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Logo (PNG/JPG)</ErpFieldLabel>
            <input
              type="file"
              accept="image/*"
              className="mt-1 text-sm"
              onChange={(e) => onLogo(e.target.files?.[0] ?? null)}
            />
            {form.logoDataUrl && (
              <img src={form.logoDataUrl} alt="Logo preview" className="mt-2 h-12 object-contain" />
            )}
          </label>
        </div>
        <button type="button" className={`mt-4 ${erp.actionBtn}`} onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save branding"}
        </button>
      </Panel>

      <Panel title="Fiscal & regional defaults">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <ErpFieldLabel>Fiscal year starts (month)</ErpFieldLabel>
            <select
              className={`mt-1 ${erp.input}`}
              value={form.fiscal.fiscalYearStartMonth}
              onChange={(e) =>
                setForm({
                  ...form,
                  fiscal: { ...form.fiscal, fiscalYearStartMonth: Number(e.target.value) },
                })
              }
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <ErpFieldLabel>Base currency</ErpFieldLabel>
            <select
              className={`mt-1 ${erp.input}`}
              value={form.fiscal.baseCurrency}
              onChange={(e) =>
                setForm({ ...form, fiscal: { ...form.fiscal, baseCurrency: e.target.value } })
              }
            >
              {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <ErpFieldLabel>Tax region</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              value={form.fiscal.taxRegion}
              onChange={(e) =>
                setForm({ ...form, fiscal: { ...form.fiscal, taxRegion: e.target.value } })
              }
            />
          </label>
        </div>
        <button
          type="button"
          className={`mt-4 ${erp.secondaryBtn}`}
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save fiscal settings"}
        </button>
      </Panel>
    </div>
  );
}
