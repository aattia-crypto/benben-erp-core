import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  CircleDot,
  ShieldCheck,
  Building2,
  Calendar,
  UserCog,
  KeyRound,
  Database,
  Wifi,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { SetupLegalAgreementStep } from "@/components/SetupLegalAgreementStep";
import { Progress } from "@/components/ui/progress";
import {
  isWorkspaceInitialized,
  setWorkspace,
} from "@/lib/workspace-store";
import { isDesktopAuth } from "@/lib/desktop-api";
import { initializeAdmin, initializeAdminAsync, getSession } from "@/lib/auth-store";
import {
  updateOrgProfile,
  updateCompanyBranding,
  type OrgProfile,
} from "@/lib/org-profile";
import { activateLicense } from "@/lib/licenseService";
import { readLocalLicense, saveLocalLicense } from "@/lib/licenseStorage";
import {
  checkAndBootstrapDatabase,
  verifyNetworkPortAvailability,
} from "@/lib/onboarding-bridge";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "First-Time Setup — Benben ERP" },
      { name: "description", content: "Initialize your Benben ERP workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupPage,
});

const STEPS = [
  "legal",
  "license",
  "database",
  "network",
  "welcome",
  "company",
  "fiscal",
  "admin",
] as const;
type Step = (typeof STEPS)[number];

const LAN_PORT = 8080;

function SetupPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("legal");
  const [legalAgreed, setLegalAgreed] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [dbStatus, setDbStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [dbMessage, setDbMessage] = useState("");
  const [portStatus, setPortStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [portMessage, setPortMessage] = useState("");
  const [portAvailable, setPortAvailable] = useState<boolean | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [tagline, setTagline] = useState("");
  const [taxRegion, setTaxRegion] = useState("US");
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [fiscalMonth, setFiscalMonth] = useState(1);
  const [loadDemoData, setLoadDemoData] = useState(true);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isWorkspaceInitialized()) {
      nav({ to: getSession() ? "/" : "/login" });
    }
  }, [nav]);

  useEffect(() => {
    const notice =
      typeof window !== "undefined"
        ? (window as Window & { __BENBEN_LICENSE_NOTICE__?: string }).__BENBEN_LICENSE_NOTICE__
        : undefined;
    if (notice?.trim()) {
      setStep("license");
      setErr(notice.trim());
    }
  }, []);

  useEffect(() => {
    if (step !== "license") return;
    const stored = readLocalLicense();
    if (stored) {
      setStep("database");
    }
  }, [step]);

  const runDatabaseBootstrap = useCallback(async () => {
    setDbStatus("running");
    setDbMessage("Initializing localized database infrastructure…");
    setErr(null);

    const res = await checkAndBootstrapDatabase();
    if (!res.ok) {
      setDbStatus("error");
      setDbMessage(res.error);
      setErr(res.error);
      return;
    }

    setDbStatus("success");
    setDbMessage(res.report.message);
    window.setTimeout(() => setStep("network"), 900);
  }, []);

  useEffect(() => {
    if (step !== "database") return;
    void runDatabaseBootstrap();
  }, [step, runDatabaseBootstrap]);

  const runPortCheck = useCallback(async () => {
    setPortStatus("running");
    setPortMessage(`Checking port ${LAN_PORT} for LAN Mode…`);
    setPortAvailable(null);
    setErr(null);

    const res = await verifyNetworkPortAvailability(LAN_PORT);
    if (!res.ok) {
      setPortStatus("error");
      setPortMessage(res.error);
      setPortAvailable(false);
      setErr(res.error);
      return;
    }

    setPortAvailable(res.report.available);
    setPortMessage(res.report.message);
    setPortStatus(res.report.available ? "success" : "error");
    if (!res.report.available) {
      setErr(res.report.message);
    }
  }, []);

  useEffect(() => {
    if (step === "network") {
      void runPortCheck();
    }
  }, [step, runPortCheck]);

  const stepIndex = STEPS.indexOf(step);

  function next() {
    setErr(null);
    if (step === "legal") {
      if (!legalAgreed) return setErr("You must accept the legal agreements to continue.");
      setStep("license");
    } else if (step === "network") {
      if (!portAvailable) return setErr("Resolve the port conflict before continuing.");
      setStep("welcome");
    } else if (step === "welcome") setStep("company");
    else if (step === "company") {
      if (!companyName.trim()) return setErr("Company name is required.");
      setStep("fiscal");
    } else if (step === "fiscal") setStep("admin");
  }

  function back() {
    setErr(null);
    if (step === "admin") setStep("fiscal");
    else if (step === "fiscal") setStep("company");
    else if (step === "company") setStep("welcome");
    else if (step === "welcome") setStep("network");
    else if (step === "network") setStep("database");
    else if (step === "database") setStep("license");
    else if (step === "license") setStep("legal");
  }

  async function submitLicense(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmed = licenseKey.trim();
    if (!trimmed) {
      setErr("Enter your Polar license key to continue.");
      return;
    }

    setLicenseBusy(true);
    try {
      // Open-core: activateLicense is local-first (no Polar network) unless commercial online flag is set.
      const result = await activateLicense(trimmed);
      if (!result.ok) {
        setErr(result.error);
        return;
      }

      try {
        saveLocalLicense(result.license, trimmed);
      } catch (saveErr) {
        const message = saveErr instanceof Error ? saveErr.message : String(saveErr);
        setErr(message);
        return;
      }

      setStep("database");
    } finally {
      setLicenseBusy(false);
    }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) return setErr("Admin password must be at least 8 characters.");
    if (password !== confirm) return setErr("Passwords do not match.");

    if (!readLocalLicense()) {
      return setErr("License activation is required before completing setup.");
    }

    setBusy(true);
    const profile: Partial<OrgProfile> = {
      fiscalYearStartMonth: fiscalMonth,
      fiscalYearStartDay: 1,
      baseCurrency,
      taxRegion,
      loadDemoData,
      onboardingComplete: true,
    };
    updateOrgProfile(profile);
    updateCompanyBranding({
      legalName: companyName.trim(),
      tagline,
      country: taxRegion === "US" ? "USA" : taxRegion,
    });
    setWorkspace(companyName);

    const res = isDesktopAuth()
      ? await initializeAdminAsync({
          username: adminUsername.trim().toLowerCase(),
          password,
          companyName: companyName.trim(),
        })
      : initializeAdmin({
          username: adminUsername.trim().toLowerCase(),
          password,
          companyName: companyName.trim(),
        });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    if (loadDemoData) {
      void import("@/lib/demo-seed").then(({ seedDemoWorkspaceMetadata, enrichDemoModuleNotes }) => {
        seedDemoWorkspaceMetadata();
        enrichDemoModuleNotes();
      });
    }
    nav({ to: "/" });
  }

  const dbProgress =
    dbStatus === "idle" ? 0 : dbStatus === "running" ? 55 : dbStatus === "success" ? 100 : 35;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className={`w-full ${step === "legal" ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-brand text-brand-foreground">
            <CircleDot className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold">Benben</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              ERP · First-Time Setup
            </div>
          </div>
        </div>

        <div className="mb-4 flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-brand" : "bg-border"}`}
              title={s}
            />
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {step === "legal" && (
            <>
              <SetupLegalAgreementStep
                agreed={legalAgreed}
                onAgreedChange={setLegalAgreed}
                onContinue={next}
              />
              {err && (
                <div className="mt-3">
                  <ErrBox msg={err} />
                </div>
              )}
            </>
          )}

          {step === "license" && (
            <>
              <div className="mb-3 flex items-center gap-2 text-brand">
                <KeyRound className="h-4 w-4" />
                <h1 className="text-lg font-semibold">Activate your license</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter the Polar license key from your purchase confirmation. It will be validated
                online and stored securely on this device.
              </p>
              {err && (
                <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                  {err}
                </div>
              )}
              <form onSubmit={submitLicense} className="mt-4 space-y-3">
                <Field
                  label="License key"
                  value={licenseKey}
                  onChange={setLicenseKey}
                  placeholder="Paste your license key"
                  required
                  autoComplete="off"
                />
                {err && step !== "license" && <ErrBox msg={err} />}
                <button
                  type="submit"
                  disabled={licenseBusy}
                  className="h-9 w-full rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg disabled:opacity-60"
                >
                  {licenseBusy ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Validating license…
                    </span>
                  ) : (
                    "Activate & continue"
                  )}
                </button>
                <button
                  type="button"
                  onClick={back}
                  disabled={licenseBusy}
                  className="h-9 w-full rounded-md border border-border text-sm text-muted-foreground hover:bg-surface"
                >
                  Back
                </button>
              </form>
            </>
          )}

          {step === "database" && (
            <>
              <div className="mb-3 flex items-center gap-2 text-brand">
                <Database className="h-4 w-4" />
                <h1 className="text-lg font-semibold">Database infrastructure</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Benben runs a localized PostgreSQL database on this machine. No cloud database is
                required for daily operations.
              </p>
              <div className="mt-5 space-y-3 rounded-md border border-border bg-surface/60 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {dbStatus === "running" && (
                    <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  )}
                  {dbStatus === "success" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  {dbStatus === "error" && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  <span>
                    {dbStatus === "running"
                      ? "Initializing localized database infrastructure…"
                      : dbMessage || "Preparing database…"}
                  </span>
                </div>
                <Progress value={dbProgress} className="h-2" />
              </div>
              {err && dbStatus === "error" && (
                <div className="mt-3">
                  <ErrBox msg={err} />
                  <button
                    type="button"
                    onClick={() => void runDatabaseBootstrap()}
                    className="mt-3 h-9 w-full rounded-md border border-border text-sm"
                  >
                    Retry bootstrap
                  </button>
                </div>
              )}
            </>
          )}

          {step === "network" && (
            <>
              <div className="mb-3 flex items-center gap-2 text-brand">
                <Wifi className="h-4 w-4" />
                <h1 className="text-lg font-semibold">Network configuration</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                LAN Mode serves the ERP UI to tablets and browsers on your local network via port{" "}
                {LAN_PORT}.
              </p>
              <div className="mt-5 space-y-3 rounded-md border border-border bg-surface/60 p-4">
                <div className="flex items-start gap-2 text-sm">
                  {portStatus === "running" && (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand" />
                  )}
                  {portStatus === "success" && portAvailable && (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                  {(portStatus === "error" || (portStatus === "success" && !portAvailable)) && (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <span>{portMessage || `Verifying port ${LAN_PORT}…`}</span>
                </div>
              </div>
              {err && portStatus === "error" && (
                <div className="mt-3">
                  <ErrBox msg={err} />
                </div>
              )}
              <div className="mt-4 flex gap-2">
                {portStatus === "error" && (
                  <button
                    type="button"
                    onClick={() => void runPortCheck()}
                    className="h-9 flex-1 rounded-md border border-border text-sm font-medium"
                  >
                    Retry check
                  </button>
                )}
                <button
                  type="button"
                  onClick={next}
                  disabled={!portAvailable || portStatus === "running"}
                  className="h-9 flex-1 rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
              <button
                type="button"
                onClick={back}
                className="mt-2 h-9 w-full rounded-md border border-border text-sm text-muted-foreground hover:bg-surface"
              >
                Back
              </button>
            </>
          )}

          {step === "welcome" && (
            <>
              <h1 className="text-lg font-semibold">Welcome to Benben</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Infrastructure checks passed. This wizard configures your company profile, fiscal
                calendar, and administrator account. Your data stays on this device.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>· Company branding for invoices and reports</li>
                <li>· Fiscal year and base currency</li>
                <li>· Optional sample data to explore modules</li>
              </ul>
              <button
                type="button"
                onClick={next}
                className="mt-6 h-9 w-full rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg hover:bg-slate-ink-2"
              >
                Get started
              </button>
              <button
                type="button"
                onClick={back}
                className="mt-2 h-9 w-full rounded-md border border-border text-sm text-muted-foreground hover:bg-surface"
              >
                Back
              </button>
            </>
          )}

          {step === "company" && (
            <>
              <div className="mb-3 flex items-center gap-2 text-brand">
                <Building2 className="h-4 w-4" />
                <h1 className="text-lg font-semibold">Company profile</h1>
              </div>
              <Field
                label="Company / legal name"
                value={companyName}
                onChange={setCompanyName}
                placeholder="e.g. Acme Manufacturing"
                required
              />
              <Field
                label="Tagline (optional)"
                value={tagline}
                onChange={setTagline}
                placeholder="Appears on PDF documents"
              />
              {err && <ErrBox msg={err} />}
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={back} className="h-9 flex-1 rounded-md border border-border text-sm">
                  Back
                </button>
                <button type="button" onClick={next} className="h-9 flex-1 rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg">
                  Continue
                </button>
              </div>
            </>
          )}

          {step === "fiscal" && (
            <>
              <div className="mb-3 flex items-center gap-2 text-brand">
                <Calendar className="h-4 w-4" />
                <h1 className="text-lg font-semibold">Fiscal & regional</h1>
              </div>
              <label className="block">
                <span className="text-xs font-medium">Fiscal year starts</span>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={fiscalMonth}
                  onChange={(e) => setFiscalMonth(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block">
                <span className="text-xs font-medium">Base currency</span>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                >
                  {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Tax region" value={taxRegion} onChange={setTaxRegion} placeholder="US, CA-ON, EU-VAT…" />
              <label className="mt-4 flex items-start gap-2 rounded-md border border-brand/30 bg-brand/5 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={loadDemoData}
                  onChange={(e) => setLoadDemoData(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <strong>Load demo sample data</strong> — recommended for first-time evaluation.
                  You can clear demo data later from Settings.
                </span>
              </label>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={back} className="h-9 flex-1 rounded-md border border-border text-sm">
                  Back
                </button>
                <button type="button" onClick={next} className="h-9 flex-1 rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg">
                  Continue
                </button>
              </div>
            </>
          )}

          {step === "admin" && (
            <>
              <div className="mb-3 flex items-center gap-2 text-brand">
                <UserCog className="h-4 w-4" />
                <h1 className="text-lg font-semibold">Administrator account</h1>
              </div>
              <div className="mb-4 flex items-start gap-3 rounded-md border border-brand/30 bg-brand/5 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-brand" />
                <div className="text-xs text-muted-foreground">
                  This account manages users, backups, and company settings. Store the password
                  securely.
                </div>
              </div>
              <form onSubmit={finish} className="space-y-3">
                <Field
                  label="Administrator username"
                  value={adminUsername}
                  onChange={setAdminUsername}
                  type="text"
                  placeholder="admin"
                  autoComplete="username"
                  required
                />
                <Field
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="Minimum 8 characters"
                  required
                />
                <Field
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                  type="password"
                  required
                />
                {err && <ErrBox msg={err} />}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={back} className="h-9 flex-1 rounded-md border border-border text-sm">
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="h-9 flex-1 rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg disabled:opacity-60"
                  >
                    {busy ? "Creating workspace…" : "Finish setup"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Already have a workspace?{" "}
          <Link to="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {msg}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}
