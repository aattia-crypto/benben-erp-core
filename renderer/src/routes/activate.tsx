import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CircleDot, KeyRound, Loader2 } from "lucide-react";

export const Route = createFileRoute("/activate")({
  head: () => ({
    meta: [
      { title: "Activate — Benben ERP" },
      { name: "description", content: "Activate Benben ERP with your product key." },
    ],
  }),
  component: ActivatePage,
});

type LicenseStatus = {
  allowed: boolean;
  mode: "trial" | "activated" | "expired";
  daysRemaining: number;
  message: string;
  machineFingerprint: string;
  activationKeyMasked: string | null;
};

function ActivatePage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [fingerprint, setFingerprint] = useState<string>("");
  const [activationKey, setActivationKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const api = window.benben?.licensing;
      if (!api) {
        if (!cancelled) {
          setErr("Activation is only available in the Benben desktop app.");
          setLoading(false);
        }
        return;
      }
      const [statusRes, fpRes] = await Promise.all([
        api.getStatus(),
        api.getMachineFingerprint(),
      ]);
      if (cancelled) return;
      if (statusRes.ok) {
        setStatus(statusRes.data);
      } else {
        setErr(statusRes.error);
      }
      if (fpRes.ok) {
        setFingerprint(fpRes.data.fingerprint);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const api = window.benben?.licensing;
    if (!api) return;
    setBusy(true);
    setErr(null);
    const res = await api.activate(activationKey.trim());
    if (!res.ok) {
      setErr(res.error);
      setBusy(false);
      return;
    }
    setErr(null);
    setStatus(res.data as LicenseStatus);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-brand text-brand-foreground">
            <CircleDot className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold">Benben</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Activation required
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-6 shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking license…
            </div>
          ) : (
            <>
              {status && (
                <p className="mb-4 text-sm text-muted-foreground">{status.message}</p>
              )}

              <div className="mb-6 rounded-md border border-border bg-surface px-3 py-2 text-xs">
                <div className="font-medium text-foreground">Machine fingerprint</div>
                <div className="mt-1 font-mono text-muted-foreground">
                  {fingerprint || status?.machineFingerprint || "—"}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Share this ID with your vendor when requesting a product key.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label
                    htmlFor="activation-key"
                    className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
                  >
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    Product key
                  </label>
                  <input
                    id="activation-key"
                    value={activationKey}
                    onChange={(e) => setActivationKey(e.target.value.toUpperCase())}
                    placeholder="NXC-XXXX-XXXX-XXXX"
                    className="h-10 w-full rounded-md border border-border bg-surface px-3 font-mono text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                  />
                </div>

                {err && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {err}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || !activationKey.trim()}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Activating…
                    </>
                  ) : (
                    "Activate and restart"
                  )}
                </button>
              </form>

              {status?.mode === "expired" && (
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Your 30-day evaluation has ended. Enter a valid key to unlock the full ERP.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
