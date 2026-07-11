import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, Panel, Pill } from "@/components/ui-bits";
import {
  getBackupConfig,
  setBackupConfig,
  getBackupHistory,
  runBackup,
  subscribeBackup,
  destinationDisplay,
  relativeTime,
  type BackupConfig,
  type CloudProvider,
} from "@/lib/backup-engine";
import { getSession } from "@/lib/auth-store";
import { desktopPickFolder, desktopValidatePath, isDesktopShell } from "@/lib/desktop-api";
import { Cloud, HardDrive, ShieldCheck, Lock, RefreshCcw, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { DemoAdminTools } from "@/components/DemoAdminTools";
import { DemoModeBanner } from "@/components/DemoModeBanner";
import { SystemHealthPanel } from "@/components/SystemHealthPanel";
import { useIsDemoMode } from "@/hooks/use-demo-data";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { ProductionBackupPanel } from "@/components/ProductionBackupPanel";
import { BrandingSettingsPanel } from "@/components/BrandingSettingsPanel";
import { EmailSettingsPanel } from "@/components/EmailSettingsPanel";
import { LanguageRegionPanel } from "@/components/LanguageRegionPanel";
import { LicensingPanel } from "@/components/LicensingPanel";
import { AiSettingsPanel } from "@/components/AiSettingsPanel";
import { ReleaseManagementPanel } from "@/components/ReleaseManagementPanel";

async function pickBackupDirectory(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (isDesktopShell()) {
    return desktopPickFolder();
  }
  toast.message("Paste backup path manually in browser preview, or use the Benben desktop app to browse.");
  return null;
}

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Benben ERP" },
      { name: "description", content: "Data sovereignty and automated backup controls." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const isDemo = useIsDemoMode();
  const [cfg, setCfg] = useState<BackupConfig>(getBackupConfig());
  const [, force] = useState(0);
  const session = getSession();

  useEffect(() => subscribeBackup(() => {
    setCfg(getBackupConfig());
    force((n) => n + 1);
  }), []);

  const history = getBackupHistory();
  const last = history[0];

  function update(patch: Partial<BackupConfig>) {
    setBackupConfig(patch);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Sovereignty & Automated Backup"
        subtitle="Benben is local-first. Your operational data lives on this device by default. Choose where automated, encrypted snapshots go — your private cloud, or your own network drive. We never store your business data."
      />

      {isDemo ? <DemoModeBanner /> : null}
      <SystemHealthPanel />
      <ProductionBackupPanel />
      <BrandingSettingsPanel />
      <EmailSettingsPanel />
      <AiSettingsPanel />
      <ReleaseManagementPanel />
      <LanguageRegionPanel />
      <LicensingPanel />
      <DemoAdminTools />
      <Panel title="Stores & POS">
        <p className="text-sm text-muted-foreground">
          Configure retail stores, warehouses, tax jurisdiction, and registers before using POS.
        </p>
        <Link
          to="/locations"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <MapPin className="h-4 w-4" /> Open location management
        </Link>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel>
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Workspace</div>
            <ShieldCheck className="h-4 w-4 text-success" />
          </div>
          <div className="mt-2 text-sm font-semibold">{session?.orgName ?? "—"}</div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">{session?.orgId ?? "—"}</div>
        </Panel>
        <Panel>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Active destination</div>
          <div className="mt-2 text-sm font-semibold">{destinationDisplay(cfg)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Cadence: every {cfg.intervalMinutes} min · plus event-driven
          </div>
        </Panel>
        <Panel>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Last snapshot</div>
          <div className="mt-2 text-sm font-semibold">
            {last ? relativeTime(last.at) : "Never"}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {last ? `${(last.bytes / 1024).toFixed(1)} KB · ${last.trigger}` : "Run a backup to start"}
          </div>
          <button
            onClick={() => runBackup("manual")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium hover:bg-surface"
          >
            <RefreshCcw className="h-3 w-3" /> Run now
          </button>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DestinationCard
          active={cfg.kind === "private-cloud"}
          icon={<Cloud className="h-4 w-4" />}
          title="Private Cloud Sync"
          subtitle="Connects to YOUR corporate Google Drive or Dropbox via OAuth. Encrypted snapshots are written strictly to your private storage — Benben never sees them."
          onActivate={() => update({ kind: "private-cloud" })}
        >
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["google-drive", "dropbox"] as CloudProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => update({ cloudProvider: p })}
                className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  cfg.cloudProvider === p
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "google-drive" ? "Google Drive" : "Dropbox"}
              </button>
            ))}
          </div>
          <button
            onClick={() =>
              update({
                cloudConnected: !cfg.cloudConnected,
                cloudAccountLabel: !cfg.cloudConnected
                  ? `${session?.orgName ?? "workspace"} · ${cfg.cloudProvider ?? "google-drive"}`
                  : undefined,
              })
            }
            disabled={cfg.kind !== "private-cloud" || !cfg.cloudProvider}
            className="mt-3 h-8 w-full rounded-md bg-slate-ink text-xs font-medium text-slate-ink-fg disabled:opacity-50"
          >
            {cfg.cloudConnected ? "Disconnect" : "Connect via OAuth"}
          </button>
          {cfg.cloudConnected && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" /> Connected as {cfg.cloudAccountLabel}
            </div>
          )}
        </DestinationCard>

        <DestinationCard
          active={cfg.kind === "local-network"}
          icon={<HardDrive className="h-4 w-4" />}
          title="Local Server / Network Drive"
          subtitle="Desktop-ready. Point Benben at a path on this machine or a mapped office server drive. Snapshots are written silently in the background — no internet required."
          onActivate={() => update({ kind: "local-network" })}
        >
          <label className="mt-3 block">
            <span className="text-[11px] font-medium text-muted-foreground">Destination path</span>
            <div className="mt-1 flex items-stretch gap-2">
              <input
                value={cfg.localPath ?? ""}
                onChange={(e) => update({ localPath: e.target.value })}
                disabled={cfg.kind !== "local-network"}
                placeholder="C:\Benben_Backups\  or  \\office-server\backups\benben"
                className="h-8 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:border-brand disabled:opacity-50"
              />
              <button
                type="button"
                onClick={async () => {
                  const picked = await pickBackupDirectory();
                  if (picked) {
                    update({ localPath: picked });
                    toast.success("Backup folder selected.");
                  }
                }}
                disabled={cfg.kind !== "local-network"}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-slate-ink px-2.5 text-[11px] font-medium text-slate-ink-fg transition-colors hover:bg-slate-ink/90 disabled:opacity-50"
              >
                <FolderOpen className="h-3.5 w-3.5" /> Browse Folder
              </button>
              <button
                type="button"
                onClick={async () => {
                  const path = cfg.localPath?.trim();
                  if (!path) {
                    toast.error("Enter or browse to a folder first.");
                    return;
                  }
                  const res = await desktopValidatePath(path);
                  if (res.ok) toast.success(`Path valid: ${res.path}`);
                  else toast.error(res.error);
                }}
                disabled={cfg.kind !== "local-network" || !cfg.localPath?.trim()}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium hover:bg-surface disabled:opacity-50"
              >
                Test path
              </button>
            </div>
          </label>
          <p className="mt-2 text-[11px] text-muted-foreground">
            On the desktop build, snapshots write directly. In the browser preview, we stage the encrypted blob locally until the desktop agent picks it up.
          </p>
        </DestinationCard>
      </div>

      <Panel>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Backup cadence</div>
            <div className="text-[11px] text-muted-foreground">
              Automated rolling snapshot. Also fires immediately after every POS checkout.
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {[15, 30, 60].map((m) => (
              <button
                key={m}
                onClick={() => update({ intervalMinutes: m })}
                className={`rounded-md border px-3 py-1 font-medium ${
                  cfg.intervalMinutes === m
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="text-sm font-semibold">Backup history</div>
          <span className="text-[11px] text-muted-foreground">{history.length} snapshots</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Trigger</th>
              <th className="px-4 py-2 font-medium">Destination</th>
              <th className="px-4 py-2 text-right font-medium">Size</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No snapshots yet. Pick a destination above and the engine will start.
                </td>
              </tr>
            )}
            {history.map((h) => (
              <tr key={h.id} className="border-t border-border">
                <td className="px-4 py-2 text-xs">{relativeTime(h.at)}</td>
                <td className="px-4 py-2 text-xs capitalize text-muted-foreground">{h.trigger}</td>
                <td className="px-4 py-2 text-xs">{h.destinationLabel}</td>
                <td className="px-4 py-2 text-right tabular-nums text-xs">
                  {(h.bytes / 1024).toFixed(1)} KB
                </td>
                <td className="px-4 py-2">
                  <Pill tone={h.status === "ok" ? "success" : h.status === "pending" ? "brand" : "neutral"}>
                    {h.status}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function DestinationCard({
  active, icon, title, subtitle, onActivate, children,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border bg-card p-4 transition-colors ${
        active ? "border-brand ring-1 ring-brand/30" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 grid h-7 w-7 place-items-center rounded-md bg-surface text-foreground">
            {icon}
          </div>
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="mt-0.5 max-w-md text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <button
          onClick={onActivate}
          className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium ${
            active
              ? "bg-brand text-brand-foreground"
              : "border border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          {active ? "Active" : "Use this"}
        </button>
      </div>
      {children}
    </div>
  );
}
