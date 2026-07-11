import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, KeyRound, Rocket, LifeBuoy, Mail, CheckCircle2, ShieldCheck, CircleDot, ArrowRight } from "lucide-react";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTACT_MAILTO,
  SUPPORT_CONTACT_EMAIL,
  COMPANY_LEGAL_NAME,
  COPYRIGHT_FOOTER,
  DATA_STAYS_LOCAL_STATEMENT,
} from "@/lib/legal-contact";

export const Route = createFileRoute("/welcome")({
  component: WelcomePage,
  head: () => ({
    meta: [
      { title: "Welcome to Benben ERP" },
      { name: "description", content: "Get started with Benben ERP — install, activate your license, and configure your local database." },
    ],
  }),
});

function WelcomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/landing" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-emerald-500 text-slate-950">
              <CircleDot className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Benben</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">ERP · Local-First</div>
            </div>
          </Link>
          <Link to="/login" className="text-sm text-slate-300 hover:text-white">
            Sign in →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-16 pb-10 text-center">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Download complete
        </div>
        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          Welcome to Benben ERP — <span className="text-emerald-400">Let’s get you set up.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400 md:text-lg">
          Three short steps to a fully operational, privacy-first ERP running on your own machine.
        </p>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <ol className="grid gap-5 md:grid-cols-3">
          <Step
            n={1}
            icon={<Download className="h-5 w-5" />}
            title="Install"
            body="Locate the file you just downloaded — Benben-Setup.exe or Benben.msi — and double-click to run the installer. Approve the Windows prompt and follow the wizard."
            tipLabel="Tip"
            tip="Default install path: C:\Program Files\Benben ERP\"
          />
          <Step
            n={2}
            icon={<KeyRound className="h-5 w-5" />}
            title="License Key"
            body={`Check your inbox for an email from ${COMPANY_LEGAL_NAME} containing your unique License Key. Paste it into the activation screen on first launch.`}
            tipLabel="Don't see it?"
            tip="Check spam / junk, or contact Benben Support below."
          />
          <Step
            n={3}
            icon={<Rocket className="h-5 w-5" />}
            title="First Launch"
            body="Once activated, open the Interactive Help tab inside the app to configure your local database location and backup destination paths."
            tipLabel="Inside the app"
            tip="Sidebar → Support → User Guide & Help"
          />
        </ol>

        {/* Quick action */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/help"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Open Interactive Help <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10"
          >
            Sign in to your workspace
          </Link>
        </div>
      </section>

      {/* Support */}
      <section className="mx-auto max-w-4xl px-6 pb-20">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-900/40 p-8 md:p-10">
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
                <LifeBuoy className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Benben Support</h2>
                <p className="mt-1 max-w-xl text-sm text-slate-400">
                  Direct line to {COMPANY_LEGAL_NAME} engineers. Response within one business day for
                  licensed installations.
                </p>
              </div>
            </div>
            <a
              href={`mailto:${SUPPORT_CONTACT_EMAIL}?subject=Benben%20ERP%20—%20Priority%20Support`}
              className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
            >
              <Mail className="h-4 w-4" />
              Contact Benben Support
            </a>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{DATA_STAYS_LOCAL_STATEMENT}</span>
        </div>
      </section>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-slate-500">
        {COPYRIGHT_FOOTER} ·{" "}
        <Link to="/terms" className="hover:text-slate-300">
          Terms of Service
        </Link>{" "}
        ·{" "}
        <a href={LEGAL_CONTACT_MAILTO} className="hover:text-slate-300">
          {LEGAL_CONTACT_EMAIL}
        </a>
      </footer>
    </div>
  );
}

function Step({
  n, icon, title, body, tipLabel, tip,
}: { n: number; icon: React.ReactNode; title: string; body: string; tipLabel: string; tip: string }) {
  return (
    <li className="relative flex flex-col rounded-xl border border-white/10 bg-slate-900/60 p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">
          {n}
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-md bg-white/5 text-emerald-300">
          {icon}
        </div>
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
      <div className="mt-5 rounded-md border border-white/5 bg-black/30 px-3 py-2 text-xs text-slate-300">
        <span className="font-semibold text-emerald-300">{tipLabel}: </span>
        <span className="text-slate-400">{tip}</span>
      </div>
    </li>
  );
}
