import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  LifeBuoy,
  ShieldCheck,
  Server,
  HardDrive,
  Cloud,
  ArrowRight,
  Users,
  UserPlus,
  Mail,
  Phone,
  Building2,
  Tag,
  Factory,
  PackageCheck,
  Wrench,
  Microscope,
  Boxes,
  ScanLine,
  Wifi,
  WifiOff,
  BookOpenText,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  CircleDot,
  CreditCard,
  Receipt,
  Landmark,
  Wallet,
  GitBranch,
  BadgeDollarSign,
} from "lucide-react";
import { FinanceHelpGuides, ArApHelpGuides, CrmHelpGuides } from "@/components/help/FinanceHelpGuides";
import { GettingStartedHelpGuides } from "@/components/help/GettingStartedHelpGuides";
import { HrPayrollHelpGuides } from "@/components/help/HrPayrollHelpGuides";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "User Guide & Help — Benben ERP" },
      { name: "description", content: "Interactive user manual and knowledge base for Benben ERP." },
    ],
  }),
  component: HelpPage,
});

type TabKey = "setup" | "finance" | "arap" | "crm" | "crmguide" | "manufacturing" | "pos" | "hrpayroll";

const TABS: { key: TabKey; label: string; icon: typeof LifeBuoy; hint: string }[] = [
  { key: "setup", label: "Initial Setup & Backups", icon: ShieldCheck, hint: "Data sovereignty" },
  { key: "finance", label: "Finance Modules", icon: Landmark, hint: "GL, bank, FX" },
  { key: "arap", label: "AR & AP", icon: Wallet, hint: "Invoices & pay" },
  { key: "crm", label: "CRM (Clients & Vendors)", icon: Users, hint: "Add contacts" },
  { key: "crmguide", label: "CRM & Pipeline", icon: GitBranch, hint: "360 & automation" },
  { key: "manufacturing", label: "Manufacturing Stages", icon: Factory, hint: "WIP timeline" },
  { key: "pos", label: "POS & Cashier Guide", icon: ScanLine, hint: "Touch grid" },
  { key: "hrpayroll", label: "HR & Payroll Guide", icon: BadgeDollarSign, hint: "Employees · GL" },
];

function HelpPage() {
  const [tab, setTab] = useState<TabKey>("setup");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Hero */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-brand/10 via-surface to-background p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-brand-foreground shadow-sm">
            <BookOpenText className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Knowledge Base
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">User Guide & Help</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              A visual walkthrough of Benben ERP — designed so anyone, regardless of technical
              ability, can master the system. Pick a topic below to get started.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                active
                  ? "border-brand bg-brand/10 text-brand-foreground/90 shadow-sm"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className={`h-4 w-4 ${active ? "text-brand" : ""}`} />
              <span className="font-medium">{t.label}</span>
              <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground md:inline">
                · {t.hint}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "setup" && <SetupTab />}
      {tab === "finance" && <FinanceHelpGuides />}
      {tab === "arap" && <ArApHelpGuides />}
      {tab === "crm" && <CrmTab />}
      {tab === "crmguide" && <CrmHelpGuides />}
      {tab === "manufacturing" && <ManufacturingTab />}
      {tab === "pos" && <PosTab />}
      {tab === "hrpayroll" && <HrPayrollHelpGuides />}
    </div>
  );
}

/* ─────────────────────────── Reusable bits ─────────────────────────── */

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-foreground shadow">
        {n}
      </div>
      <div className="flex-1 space-y-1">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function TipBox({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "success";
  title: string;
  children: React.ReactNode;
}) {
  const map = {
    info: { icon: Lightbulb, c: "border-brand/30 bg-brand/5 text-foreground", iconC: "text-brand" },
    warn: {
      icon: AlertTriangle,
      c: "border-warning/30 bg-warning/10 text-foreground",
      iconC: "text-warning",
    },
    success: {
      icon: CheckCircle2,
      c: "border-success/30 bg-success/10 text-foreground",
      iconC: "text-success",
    },
  } as const;
  const m = map[tone];
  return (
    <div className={`flex gap-3 rounded-lg border p-3 ${m.c}`}>
      <m.icon className={`mt-0.5 h-4 w-4 shrink-0 ${m.iconC}`} />
      <div className="text-sm">
        <div className="font-medium">{title}</div>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function FieldCard({
  icon: Icon,
  label,
  example,
  required,
}: {
  icon: typeof Mail;
  label: string;
  example: string;
  required?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand" />
        <span className="text-sm font-medium">{label}</span>
        {required && (
          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
            Required
          </span>
        )}
      </div>
      <div className="rounded-md border border-dashed border-border bg-surface px-2 py-1.5 font-mono text-xs text-muted-foreground">
        {example}
      </div>
    </div>
  );
}

/* ─────────────────────────── Tab 1: Setup ─────────────────────────── */

function SetupTab() {
  return (
    <div className="space-y-6">
      <GettingStartedHelpGuides />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-brand" />
            Data Sovereignty — Your Data Stays With You
          </div>

          {/* Visual diagram */}
          <div className="rounded-xl border border-dashed border-border bg-surface p-5">
            <div className="grid grid-cols-3 items-center gap-3">
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-brand text-brand-foreground">
                  <CircleDot className="h-6 w-6" />
                </div>
                <div className="text-sm font-semibold">Benben</div>
                <div className="text-[11px] text-muted-foreground">Local-first app</div>
              </div>

              <div className="flex flex-col items-center gap-1">
                <ArrowRight className="h-5 w-5 text-brand" />
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Auto · every 30 min
                </div>
                <div className="h-px w-full bg-gradient-to-r from-transparent via-brand to-transparent" />
              </div>

              <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-success/15 text-success">
                  <HardDrive className="h-6 w-6" />
                </div>
                <div className="text-sm font-semibold">Your Drive</div>
                <div className="text-[11px] text-muted-foreground">
                  Local server, NAS, or office PC
                </div>
              </div>
            </div>
            <div className="mt-3 text-center text-[11px] text-muted-foreground">
              Backups are written directly to a path <span className="font-mono">you</span> own — no
              third party in between.
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Cloud className="h-4 w-4 text-brand" /> Private Cloud
            </div>
            <p className="text-xs text-muted-foreground">
              Sync to <strong>your own</strong> Google Drive, OneDrive, or Dropbox account. We never
              hold the keys.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Server className="h-4 w-4 text-brand" /> Network Drive
            </div>
            <p className="text-xs text-muted-foreground">
              Point to a folder on a mapped office server, e.g.
              <span className="ml-1 font-mono">\\fileserver\Benben</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Where is the badge */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 text-sm font-semibold">Spot the “Secured” badge</div>
        <div className="rounded-lg border border-border bg-slate-ink p-3 text-slate-ink-fg">
          {/* Mock top utility bar */}
          <div className="flex items-center gap-3 rounded-md bg-background px-3 py-2 text-foreground">
            <div className="h-7 flex-1 rounded-md border border-border bg-surface" />
            <div className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2 py-1 text-[11px] font-medium text-success ring-2 ring-success/30">
              ● Data Secured Locally 4 mins ago
            </div>
            <div className="h-7 w-7 rounded-full bg-slate-ink" />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowRight className="h-3.5 w-3.5 text-success" />
          Look at the very top of every screen — green means your data is safe.
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Step n={1} title="Open Settings → Data Sovereignty">
          From the sidebar, choose <strong>Settings</strong>. Pick either Private Cloud or Local
          Network Drive.
        </Step>
        <Step n={2} title="Browse to a folder you own">
          Click <strong>Browse Folder</strong> and select any folder on your computer or mapped
          drive. Benben will write there in the background.
        </Step>
        <Step n={3} title="Watch for the green badge">
          Within a few minutes the top utility bar shows{" "}
          <span className="font-medium text-success">● Data Secured Locally</span>. You're done.
        </Step>
        <Step n={4} title="Test a restore monthly">
          Copy the latest snapshot file out of your folder and store a duplicate offsite. Trust, but
          verify.
        </Step>
      </div>

      <TipBox tone="warn" title="Critical: pick a path that survives a reboot">
        Avoid the Desktop or Downloads folder. Use a dedicated path like{" "}
        <span className="font-mono">C:\Benben_Backups\</span> or a network share so snapshots are
        never accidentally deleted.
      </TipBox>
    </div>
  );
}

/* ─────────────────────────── Tab 2: CRM ─────────────────────────── */

function CrmTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="h-4 w-4 text-brand" /> Add a contact in 4 steps
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Step n={1} title="Open CRM (Clients & Vendors)">
            From the sidebar choose <strong>CRM</strong>. The list of all your contacts opens.
          </Step>
          <Step n={2} title="Click + New Contact">
            Top-right of the page. Decide if this is a <em>Client</em> (sells to) or{" "}
            <em>Vendor</em> (buys from).
          </Step>
          <Step n={3} title="Fill in the visual form">
            Only the Required fields below must be filled. Everything else can be added later.
          </Step>
          <Step n={4} title="Save & tag">
            Add tags like <em>VIP</em>, <em>Distributor</em>, or a region so you can filter later.
          </Step>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Field-by-field guide</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FieldCard icon={Building2} label="Company / Display Name" example="Acme Trading LLC" required />
          <FieldCard icon={Users} label="Contact Person" example="Jane Doe" required />
          <FieldCard icon={Mail} label="Email" example="jane@acme.com" />
          <FieldCard icon={Phone} label="Phone" example="+1 (555) 123-4567" />
          <FieldCard icon={Tag} label="Tags" example="VIP, Distributor, EU" />
          <FieldCard icon={CreditCard} label="Payment Terms" example="Net 30" />
        </div>
      </div>

      <TipBox title="Why split Clients & Vendors in one module?">
        A single contact often plays both roles (you sell finished goods to them, and buy raw
        material). Benben stores one record with two role flags — no duplicate entries.
      </TipBox>
    </div>
  );
}

/* ──────────────────── Tab 3: Manufacturing Stages ──────────────────── */

function ManufacturingTab() {
  const stages = [
    { icon: Boxes, label: "Staging", color: "bg-muted text-foreground", note: "Raw materials reserved" },
    { icon: Wrench, label: "Production", color: "bg-brand/15 text-brand", note: "WIP capital ↑" },
    { icon: Microscope, label: "QC", color: "bg-warning/15 text-warning", note: "Quality hold" },
    { icon: PackageCheck, label: "Finished Goods", color: "bg-success/15 text-success", note: "Inventory ↑ · WIP ↓" },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Factory className="h-4 w-4 text-brand" /> Inventory journey · interactive timeline
        </div>

        {/* Timeline */}
        <div className="relative">
          <div className="absolute left-6 right-6 top-6 h-1 rounded-full bg-gradient-to-r from-muted via-brand to-success" />
          <div className="relative grid grid-cols-2 gap-4 md:grid-cols-4">
            {stages.map((s, i) => (
              <div key={s.label} className="flex flex-col items-center gap-2 text-center">
                <div className={`relative grid h-12 w-12 place-items-center rounded-full border-2 border-card ${s.color} shadow`}>
                  <s.icon className="h-5 w-5" />
                  <span className="absolute -top-2 -right-2 grid h-5 w-5 place-items-center rounded-full bg-slate-ink text-[10px] font-bold text-slate-ink-fg">
                    {i + 1}
                  </span>
                </div>
                <div className="text-sm font-semibold">{s.label}</div>
                <div className="text-[11px] text-muted-foreground">{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <CircleDot className="h-4 w-4 text-brand" /> What is WIP capital?
          </div>
          <p className="text-sm text-muted-foreground">
            Work-In-Progress is the value of materials & labor sitting on the factory floor —
            money you've spent but not yet sold. Benben updates the WIP account in real time as
            batches move from <em>Staging</em> into <em>Production</em>, then releases it when goods
            move to <em>Finished Goods</em>.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Receipt className="h-4 w-4 text-brand" /> Auto-posted journal entries
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Staging → Production: Dr <em>WIP</em> · Cr <em>Raw Materials</em></li>
            <li>• Production → QC: no posting (quality hold)</li>
            <li>• QC → Finished: Dr <em>Inventory FG</em> · Cr <em>WIP</em></li>
          </ul>
        </div>
      </div>

      <TipBox tone="success" title="Drag & drop between columns">
        On the Manufacturing board, simply drag a batch card to its next stage. The ledger entry is
        posted instantly — no manual accounting needed.
      </TipBox>
    </div>
  );
}

/* ─────────────────────────── Tab 4: POS ─────────────────────────── */

function PosTab() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ScanLine className="h-4 w-4 text-brand" /> The touch grid at a glance
          </div>
          {/* Mock POS layout */}
          <div className="grid grid-cols-5 gap-2 rounded-lg border border-dashed border-border bg-surface p-3">
            <div className="col-span-3 grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-md border border-border bg-card p-2 text-[10px] font-medium shadow-sm"
                >
                  <div className="mb-1 h-8 rounded bg-gradient-to-br from-brand/15 to-brand/5" />
                  Item {i + 1}
                  <div className="text-muted-foreground">$9.99</div>
                </div>
              ))}
            </div>
            <div className="col-span-2 flex flex-col gap-2 rounded-md border border-border bg-card p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cart · Store 3
              </div>
              <div className="flex-1 space-y-1 text-xs">
                <div className="flex justify-between rounded bg-surface px-2 py-1">
                  <span>Item 2 ×2</span>
                  <span>$19.98</span>
                </div>
                <div className="flex justify-between rounded bg-surface px-2 py-1">
                  <span>Item 5 ×1</span>
                  <span>$9.99</span>
                </div>
              </div>
              <button className="rounded-md bg-success px-2 py-2 text-xs font-bold text-success-foreground">
                CHECKOUT $29.97
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Wifi className="h-4 w-4 text-success" /> Online mode
            </div>
            <p className="text-xs text-muted-foreground">
              Sale posts instantly to the General Ledger:{" "}
              <span className="font-mono">Dr Cash · Cr Sales Revenue</span>.
            </p>
          </div>
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <WifiOff className="h-4 w-4 text-warning" /> Offline mode
            </div>
            <p className="text-xs text-muted-foreground">
              Sales are saved to the local database (PGlite) and queued. As soon as the warehouse
              comes back online, they sync automatically — no data loss.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Step n={1} title="Pick a store at the top">
          The Location dropdown tags every sale & inventory deduction to that store (Store 1–6 or
          Warehouse).
        </Step>
        <Step n={2} title="Tap items into the cart">
          The grid is touch-optimized — large hit areas, instant feedback.
        </Step>
        <Step n={3} title="Press CHECKOUT">
          Stock at the chosen store decreases and the ledger posts automatically.
        </Step>
        <Step n={4} title="Keep selling — even offline">
          A red WiFi icon means the sale is queued locally. It will sync the moment internet
          returns.
        </Step>
      </div>

      <TipBox tone="info" title="See the link to Accounting">
        Open the <Link to="/accounting" className="font-medium text-brand underline">Accounting</Link>{" "}
        page right after a sale — you'll see the new journal line appear in real time.
      </TipBox>
    </div>
  );
}
