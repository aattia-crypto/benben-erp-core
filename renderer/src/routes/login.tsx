import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { loginAsync } from "@/lib/auth-store";
import { isLanMode } from "@/lib/lan-mode";
import { isWorkspaceInitialized } from "@/lib/workspace-store";
import { CircleDot } from "lucide-react";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    // LAN clients connect to an already-provisioned host — skip local setup gate.
    if (typeof window !== "undefined" && !isLanMode() && !isWorkspaceInitialized()) {
      throw redirect({ to: "/setup" });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign In — Benben ERP" },
      { name: "description", content: "Sign in to your Benben ERP workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await loginAsync(username, password);
    if (!res.ok) { setErr(res.error); return; }
    nav({ to: res.mustChange ? "/change-password" : "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-brand text-brand-foreground">
            <CircleDot className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold">Benben</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              ERP · Local-First
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Sign in to Benben</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Access your secured ERP dashboard.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <Field label="Username" value={username} onChange={setUsername} type="text" placeholder="admin" autoComplete="username" required />
            <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="Enter your password" required />

            {err && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {err}
              </div>
            )}

            <button
              type="submit"
              className="h-9 w-full rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg hover:bg-slate-ink-2"
            >
              Sign in
            </button>
          </form>

          <div className="mt-3 text-right">
            <Link to="/forgot-password" className="text-xs font-medium text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Contact your Administrator if you need an account.{" "}
          <Link to="/landing" className="underline">Back home</Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, required, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; hint?: string;
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
        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
