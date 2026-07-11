import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { requestPasswordReset } from "@/lib/auth-store";
import { Mail, KeyRound, Copy, Check } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Benben ERP" },
      { name: "description", content: "Reset your Benben ERP password." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setIssued(null);
    const res = requestPasswordReset(username);
    if (!res.ok) { setErr(res.error); return; }
    setIssued(res.tempPassword);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-brand text-brand-foreground">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Reset your password</h1>
              <p className="text-xs text-muted-foreground">
                Enter your registered username and we'll issue a one-time temporary password.
              </p>
            </div>
          </div>

          {!issued ? (
            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-foreground">Username</span>
                <div className="relative mt-1">
                  <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </label>

              {err && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {err}
                </div>
              )}

              <button
                type="submit"
                className="h-9 w-full rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg hover:bg-slate-ink-2"
              >
                Send reset
              </button>
              <div className="text-center text-xs text-muted-foreground">
                <Link to="/login" className="underline">Back to sign in</Link>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-success/30 bg-success/10 p-3 text-xs text-success">
                A temporary password has been issued for <strong>{username}</strong>.
                Use it to sign in — you'll be required to set a new password immediately.
              </div>
              <div className="rounded-md border border-border bg-surface p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Temporary password
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="select-all font-mono text-sm">{issued}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(issued);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-surface"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  In production this is delivered via your authentication provider's email.
                  Benben is local-first, so the temporary credential is shown here for your records.
                </p>
              </div>
              <Link
                to="/login"
                className="block h-9 rounded-md bg-slate-ink text-center text-sm font-medium text-slate-ink-fg hover:bg-slate-ink-2 leading-9"
              >
                Continue to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
