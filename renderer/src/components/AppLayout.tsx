import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Search, Bell, LogOut, ShieldCheck } from "lucide-react";
import {
  canAccess,
  canAccessRbacOnly,
  useRole,
  getActingRole,
  setActingRole,
  isAdmin,
  isEnterpriseRoute,
} from "@/lib/rbac";
import { isEnterpriseLicenseActive, subscribeLicense } from "@/lib/license-store";
import { AppSidebar } from "@/components/AppSidebar";
import { PremiumActivationRequired } from "@/components/PremiumActivationRequired";
import { AiCopilot } from "@/components/ai/AiCopilot";
import { UpdateNotificationBanner } from "@/components/UpdateNotificationBanner";
import { useEffect, useState } from "react";
import { getSession, getCurrentUser, logout, subscribeAuth, whenAuthReady, type Session } from "@/lib/auth-store";
import { isWorkspaceInitialized, subscribeWorkspace } from "@/lib/workspace-store";
import { isLanMode } from "@/lib/lan-mode";
import { isOnboardingComplete, markOnboardingComplete } from "@/lib/org-profile";
import { SUPPORT_CONTACT_EMAIL, SUPPORT_CONTACT_MAILTO, COPYRIGHT_FOOTER } from "@/lib/legal-contact";
import { isDesktopShell } from "@/lib/desktop-api";
import { shouldRunMigrationGate } from "@/lib/migration-bootstrap";
import { hydrateAllOperationalStores, seedAllDemoStoresNow } from "@/lib/operations-hydrate";
import { isPresenterMode } from "@/lib/presenter-mode";
import { isDemoBuild } from "@/lib/demo-build";
import { EvaluationDemoBanner } from "@/components/EvaluationDemoBanner";
import {
  getLastBackup,
  getBackupConfig,
  startBackupEngine,
  subscribeBackup,
  destinationDisplay,
  relativeTime,
} from "@/lib/backup-engine";
const PUBLIC_ROUTES = [
  "/login",
  "/landing",
  "/terms",
  "/welcome",
  "/privacy",
  "/refunds",
  "/forgot-password",
  "/setup",
  "/activate",
  "/migrating",
];
const PASSWORD_GATE_ROUTE = "/change-password";
const SETUP_ROUTE = "/setup";
const ACTIVATE_ROUTE = "/activate";

export function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [online, setOnline] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [mounted, setMounted] = useState(false);
  const [, force] = useState(0);
  const role = useRole();
  const acting = getActingRole();
  const [, setLicenseTick] = useState(0);
  useEffect(() => subscribeLicense(() => setLicenseTick((n) => n + 1)), []);
  const enterpriseLicensed = isEnterpriseLicenseActive();
  useEffect(() => {
    if (isWorkspaceInitialized() && !isOnboardingComplete()) {
      markOnboardingComplete();
    }
    void import("@/lib/demo-seed").then(({ seedDemoWorkspaceMetadata, enrichDemoModuleNotes }) => {
      seedDemoWorkspaceMetadata();
      enrichDemoModuleNotes();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void whenAuthReady().then(() => {
      if (!cancelled) {
        setSession(getSession());
        setMounted(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  useEffect(() => subscribeAuth(() => setSession(getSession())), []);
  useEffect(() => subscribeBackup(() => force((n) => n + 1)), []);
  useEffect(() => subscribeWorkspace(() => force((n) => n + 1)), []);
  useEffect(() => {
    if (session) startBackupEngine();
  }, [session]);

  const [migrationChecked, setMigrationChecked] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    if (isPresenterMode()) {
      setMigrationChecked(true);
      if (path === "/login" || path === SETUP_ROUTE || path === "/migrating") {
        navigate({ to: "/" });
      }
      return;
    }
    void shouldRunMigrationGate().then((required) => {
      setMigrationChecked(true);
      if (required && path !== "/migrating") {
        navigate({ to: "/migrating" });
      }
    });
  }, [mounted, path, navigate]);

  useEffect(() => {
    if (!mounted || !migrationChecked) return;
    if (path === "/migrating") return;
    if (isDemoBuild() || isPresenterMode()) {
      // Sync seed before any IPC so modules never flash empty.
      seedAllDemoStoresNow();
      void hydrateAllOperationalStores().catch((err) => {
        console.error("[AppLayout] operational store hydration failed:", err);
        seedAllDemoStoresNow();
      });
      return;
    }
    if (!isDesktopShell() || !session) return;
    void hydrateAllOperationalStores().catch((err) => {
      console.error("[AppLayout] operational store hydration failed:", err);
    });
  }, [mounted, migrationChecked, path, session]);

  // Auth & First-Time Setup gate
  useEffect(() => {
    if (!mounted || !migrationChecked) return;
    if (path === "/migrating") return;
    if (isPresenterMode()) {
      if (PUBLIC_ROUTES.includes(path) && path !== "/") {
        navigate({ to: "/" });
      }
      return;
    }
    if (!isLanMode() && !isWorkspaceInitialized() && path !== SETUP_ROUTE && path !== ACTIVATE_ROUTE) {
      navigate({ to: SETUP_ROUTE });
      return;
    }
    if (isWorkspaceInitialized() && path === SETUP_ROUTE) {
      navigate({ to: session ? "/" : "/login" });
      return;
    }
    if (!session && !PUBLIC_ROUTES.includes(path)) {
      navigate({ to: "/login" });
      return;
    }
    if (session) {
      const me = getCurrentUser();
      if (me?.must_change_password && path !== PASSWORD_GATE_ROUTE) {
        navigate({ to: PASSWORD_GATE_ROUTE });
      }
    }
  }, [session, path, navigate, mounted, migrationChecked]);

  if (!mounted || (!migrationChecked && isDesktopShell())) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <p className="text-sm text-muted-foreground">Loading Benben…</p>
      </div>
    );
  }
  if (!session && !PUBLIC_ROUTES.includes(path) && !isPresenterMode()) {
    return null;
  }
  // Render the change-password screen full-bleed (no sidebar) when forced.
  if (path === PASSWORD_GATE_ROUTE || path === "/migrating") {
    return <Outlet />;
  }
  if (PUBLIC_ROUTES.includes(path)) {
    return <Outlet />;
  }

  const realAdmin = isAdmin();
  const last = getLastBackup();
  const cfg = getBackupConfig();
  const backupBadge = (() => {
    if (cfg.kind === "none") {
      return { tone: "muted", label: "● Backup destination not set" };
    }
    if (!last) {
      return { tone: "muted", label: `● ${destinationDisplay(cfg)} · awaiting first snapshot` };
    }
    if (last.status === "failed") {
      return { tone: "warn", label: `● Backup failed · ${relativeTime(last.at)}` };
    }
    if (last.status === "pending") {
      return { tone: "muted", label: `● Snapshot staged · ${relativeTime(last.at)}` };
    }
    const verb = cfg.kind === "private-cloud" ? "Synced to Private Drive" : "Data Secured Locally";
    return { tone: "ok", label: `● ${verb} ${relativeTime(last.at)}` };
  })();
  const initials = session!.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen w-full bg-surface text-foreground">
      <AppSidebar
        sessionOrgName={session!.orgName}
        sessionOrgId={session!.orgId}
        online={online}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-6 backdrop-blur">
          <EvaluationDemoBanner className="hidden shrink-0 lg:inline-flex" />
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search batches, accounts, clients & vendors…"
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <Link
            to="/settings"
            title={last?.message ?? destinationDisplay(cfg)}
            className={`hidden items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium md:inline-flex ${
              backupBadge.tone === "ok"
                ? "border-success/30 bg-success/10 text-success"
                : backupBadge.tone === "warn"
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-border bg-surface text-muted-foreground"
            }`}
          >
            {backupBadge.label}
          </Link>
          <button className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-foreground">
            <Bell className="h-4 w-4" />
          </button>
          <div className="hidden items-center gap-2 rounded-md border border-border px-2 py-1 text-xs md:flex">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-muted-foreground">Period</span>
            <span className="font-medium">FY26 · May</span>
          </div>
          <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-ink text-[11px] font-medium text-slate-ink-fg" title={session!.username}>
            {initials || "U"}
          </div>
          <button
            onClick={() => { logout(); navigate({ to: "/login" }); }}
            title="Sign out"
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>
        <UpdateNotificationBanner />
        <main className="min-w-0 flex-1 px-6 py-6">
          {realAdmin && acting && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand/30 bg-brand/10 px-4 py-2 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-brand" />
                <span>
                  Previewing as <span className="font-semibold capitalize">{acting}</span>. Your real role is Admin.
                  {acting !== "finance" && (
                    <> Finance sidebar items (GL, AR, AP, Invoicing) may be hidden in this preview.</>
                  )}
                </span>
              </div>
              <button
                onClick={() => setActingRole(null)}
                className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-brand-foreground hover:bg-brand/90"
              >
                Exit preview · Return to Admin
              </button>
            </div>
          )}
          {canAccess(path, role) || (realAdmin && path === "/users") ? (
            <Outlet />
          ) : isEnterpriseRoute(path) &&
            canAccessRbacOnly(path, role) &&
            !enterpriseLicensed ? (
            <PremiumActivationRequired />
          ) : (
            <div className="mx-auto max-w-lg rounded-md border border-warning/30 bg-warning/10 p-6 text-sm">
              <div className="mb-1 flex items-center gap-2 font-semibold text-warning">
                <ShieldCheck className="h-4 w-4" /> Restricted by Departmental Guard
              </div>
              <p className="text-muted-foreground">
                Your role <span className="font-semibold capitalize">{role}</span> does not have access to this module.
                {realAdmin && acting && " Use \"Exit preview\" above to return to your Admin view."}
                {!realAdmin && " Contact an Admin if you need this changed."}
              </p>
            </div>
          )}
        </main>
        <AiCopilot />
        <footer className="border-t border-border px-6 py-3 text-center text-[11px] text-muted-foreground">
          {COPYRIGHT_FOOTER} ·{" "}
          <a href={SUPPORT_CONTACT_MAILTO} className="hover:text-foreground">
            {SUPPORT_CONTACT_EMAIL}
          </a>
        </footer>
      </div>
    </div>
  );
}
