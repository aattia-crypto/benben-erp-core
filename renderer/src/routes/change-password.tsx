import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { changePasswordAsync, getCurrentUser, logout } from "@/lib/auth-store";
import { KeyRound, ShieldAlert, LogOut } from "lucide-react";

export const Route = createFileRoute("/change-password")({
  head: () => ({
    meta: [
      { title: "Update Your Password — Benben ERP" },
      { name: "description", content: "Set a new secure password for your Benben account." },
    ],
  }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const nav = useNavigate();
  const [user, setUser] = useState(() => getCurrentUser());
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => { setUser(getCurrentUser()); }, []);

  if (!user) {
    if (typeof window !== "undefined") nav({ to: "/login" });
    return null;
  }

  const forced = user.must_change_password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw !== confirm) { setErr("Passwords do not match."); return; }
    const res = await changePasswordAsync(pw, forced ? undefined : current);
    if (!res.ok) { setErr(res.error); return; }
    setOk(true);
    setTimeout(() => nav({ to: "/" }), 600);
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
              <h1 className="text-lg font-semibold">Update Your Password</h1>
              <p className="text-xs text-muted-foreground">Signed in as {user.username}</p>
            </div>
          </div>

          {forced && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                For security, you must set a new password before accessing Benben.
                Your temporary password cannot be reused.
              </p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            {!forced && (
              <Field label="Current password" type="password" value={current} onChange={setCurrent} required />
            )}
            <Field label="New password" type="password" value={pw} onChange={setPw} required hint="At least 8 characters." />
            <Field label="Confirm new password" type="password" value={confirm} onChange={setConfirm} required />

            {err && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {err}
              </div>
            )}
            {ok && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                Password updated. Redirecting…
              </div>
            )}

            <button
              type="submit"
              className="h-9 w-full rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg hover:bg-slate-ink-2"
            >
              Set new password
            </button>
          </form>

          {forced && (
            <button
              onClick={() => { logout(); nav({ to: "/login" }); }}
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
