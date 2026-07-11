import { createFileRoute, Link } from "@tanstack/react-router";
import { SUPPORT_CONTACT_EMAIL, SUPPORT_CONTACT_MAILTO, COPYRIGHT_FOOTER } from "@/lib/legal-contact";
import {
  ShieldCheck,
  WifiOff,
  HardDrive,
  EyeOff,
  Factory,
  ScanLine,
  BookOpenText,
  Users,
  Download,
  CircleDot,
  ArrowRight,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "Benben ERP — The ERP for Manufacturing. Your Data. Your Control." },
      {
        name: "description",
        content:
          "A native Windows ERP built for privacy-first manufacturers. Track WIP, inventory, and POS without your trade secrets ever leaving your office server.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-ink text-slate-ink-fg">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-ink/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link to="/landing" className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-brand text-brand-foreground">
              <CircleDot className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Benben ERP</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-ink-muted md:flex">
            <a href="#why" className="hover:text-slate-ink-fg">Why Benben</a>
            <a href="#features" className="hover:text-slate-ink-fg">Features</a>
            <a href="#pricing" className="hover:text-slate-ink-fg">Pricing</a>
          </nav>
          <Link
            to="/login"
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-ink-fg hover:bg-white/5"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 70% 0%, oklch(0.55 0.15 165 / 0.25), transparent 60%), radial-gradient(50% 40% at 10% 20%, oklch(0.62 0.18 255 / 0.20), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Privacy-first · Local-first · Native Windows
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl md:leading-[1.05]">
            The ERP for Manufacturing.
            <br />
            <span className="text-slate-ink-muted">Your Data. Your Drive. </span>
            <span className="bg-gradient-to-r from-emerald-300 to-brand bg-clip-text text-transparent">
              Your Control.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-slate-ink-muted md:text-lg">
            A native Windows ERP built for privacy-first businesses. Track WIP, inventory, and POS
            without your trade secrets ever leaving your office server.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-ink shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
            >
              Get Started Now <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-md border border-white/10 px-5 py-3 text-sm font-medium text-slate-ink-fg hover:bg-white/5"
            >
              Explore features
            </a>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-ink-muted">
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Works offline</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Auto local backups</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Zero data mining</span>
          </div>
        </div>
      </section>

      {/* USP */}
      <section id="why" className="border-y border-white/5 bg-slate-ink-2/40">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Data Sovereignty
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Built different — because your margins aren't anyone else's business.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: WifiOff,
                title: "Offline-First Architecture",
                body: "Works even when your warehouse internet drops. POS keeps selling, production keeps logging — sync resumes when you're back online.",
              },
              {
                icon: HardDrive,
                title: "Local Backups",
                body: "Auto-syncs to your own network drive, Google Drive, or Dropbox. You hold the keys, you hold the snapshots.",
              },
              {
                icon: EyeOff,
                title: "No Data Mining",
                body: "We don't host your data. Your margins, costs, and customer list never touch our servers — by design.",
              },
            ].map((c) => (
              <div
                key={c.title}
                className="group rounded-xl border border-white/10 bg-slate-ink p-6 transition hover:border-emerald-400/30"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/20">
                  <c.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-ink-muted">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand">Core Features</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            One system for the whole shop floor.
          </h2>
          <p className="mt-3 text-slate-ink-muted">
            From the cashier counter to the general ledger — every module talks to every other module, in real time.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Factory, title: "Real-time WIP Tracking", body: "Watch jobs move through staging, production, QC, and finished goods with live capital valuation." },
            { icon: ScanLine, title: "Multi-Language POS", body: "Touch-optimized cashier grid for up to 6 stores + warehouse, with offline transaction queue." },
            { icon: BookOpenText, title: "Automated Ledger Posting", body: "Every sale, transfer, and BOM consumption auto-posts as double-entry journal entries." },
            { icon: Users, title: "Client / Vendor CRM", body: "Unified address book with credit limits, AR/AP balances, and per-contact transaction history." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-white/10 bg-slate-ink-2/30 p-5">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-brand/15 text-brand ring-1 ring-brand/30">
                <f.icon className="h-4.5 w-4.5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-white/5 bg-slate-ink-2/40">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Download & Pricing</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Own your ERP. One license. Your machines.
            </h2>
            <p className="mt-3 text-slate-ink-muted">No per-seat fees. No data hostage situations.</p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-[1fr_1.2fr]">
            {/* License card */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-slate-ink to-slate-ink-2 p-7">
              <div className="absolute right-4 top-4 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                Professional
              </div>
              <h3 className="text-lg font-semibold">Professional License</h3>
              <p className="mt-1 text-sm text-slate-ink-muted">Full ERP suite for manufacturing teams.</p>

              <div className="mt-6 space-y-3 rounded-lg border border-white/10 bg-slate-ink/60 p-4">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-emerald-400/30 bg-emerald-400/5 p-3">
                  <div>
                    <div className="text-sm font-semibold">One-Time Payment</div>
                    <div className="text-[11px] text-slate-ink-muted">Perpetual license · 1 year of updates</div>
                  </div>
                  <span className="text-sm font-semibold text-emerald-300">Best Value</span>
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-white/10 p-3 hover:bg-white/5">
                  <div>
                    <div className="text-sm font-semibold">Monthly Subscription</div>
                    <div className="text-[11px] text-slate-ink-muted">Cancel anytime · always-current updates</div>
                  </div>
                  <span className="text-xs text-slate-ink-muted">Flexible</span>
                </label>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-slate-ink-muted">
                {["Unlimited stores & warehouses", "Offline POS + auto sync", "Local + cloud backup engine", "Priority email support"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" /> {f}
                  </li>
                ))}
              </ul>

              <a
                href="#"
                className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-ink hover:bg-emerald-400"
              >
                Purchase License <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            {/* Download card */}
            <div className="rounded-2xl border border-white/10 bg-slate-ink p-7">
              <h3 className="text-lg font-semibold">Download for Windows</h3>
              <p className="mt-1 text-sm text-slate-ink-muted">
                Native desktop build. Installs in under a minute. Runs entirely on your hardware.
              </p>

              <div className="mt-6 space-y-3">
                <a
                  href="#"
                  className="group flex items-center justify-between rounded-lg border border-white/10 bg-slate-ink-2/40 p-4 hover:border-brand/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-md bg-brand/15 text-brand ring-1 ring-brand/30">
                      <Download className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Download for Windows</div>
                      <div className="text-[11px] text-slate-ink-muted">Benben-Setup.msi · ~84 MB · Win 10/11</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-ink-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </a>
                <a
                  href="#"
                  className="group flex items-center justify-between rounded-lg border border-white/10 bg-slate-ink-2/40 p-4 hover:border-emerald-400/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30">
                      <Download className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Standard Setup (.exe)</div>
                      <div className="text-[11px] text-slate-ink-muted">Benben-Setup.exe · ~82 MB · Win 10/11</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-ink-muted transition group-hover:translate-x-0.5 group-hover:text-emerald-300" />
                </a>
              </div>

              <div className="mt-6 rounded-md border border-white/5 bg-slate-ink-2/40 p-3 text-[11px] text-slate-ink-muted">
                <span className="font-medium text-slate-ink-fg">Note:</span> macOS and Linux builds available on request for enterprise customers.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-slate-ink-muted md:flex-row">
          <div className="flex items-center gap-2">
            <div className="grid h-5 w-5 place-items-center rounded bg-brand text-brand-foreground">
              <CircleDot className="h-3 w-3" />
            </div>
            <span>{COPYRIGHT_FOOTER}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link to="/login" className="hover:text-slate-ink-fg">
              Sign in
            </Link>
            <Link to="/terms" className="hover:text-slate-ink-fg">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-slate-ink-fg">
              Privacy
            </Link>
            <a href={SUPPORT_CONTACT_MAILTO} className="hover:text-slate-ink-fg">
              {SUPPORT_CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
