import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Factory,
  BookOpenText,
  BookMarked,
  Truck,
  Package,
  Users,
  ClipboardList,
  ScanLine,
  Settings,
  ShieldCheck,
  LifeBuoy,
  UserCog,
  UserPlus,
  FileUp,
  CircleDot,
  Wifi,
  WifiOff,
  ChevronRight,
  Ship,
  Landmark,
  Receipt,
  Wallet,
  MapPin,
  Building2,
  TrendingDown,
  PiggyBank,
  Percent,
  Coins,
  BadgeDollarSign,
  CircleDollarSign,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { canAccess, useRole, getActingRole, isAdmin } from "@/lib/rbac";
import { getCompanyName } from "@/lib/workspace-store";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type NavItem = {
  to: string;
  labelKey: string;
  shortLabelKey?: string;
  icon: LucideIcon;
};

type NavGroup = {
  id: string;
  labelKey: string;
  collapsible: boolean;
  defaultOpen: boolean;
  items: NavItem[];
};

/** Direct top-level link — no collapsible group header. */
type NavDirectLink = {
  type: "link";
  to: string;
  labelKey: string;
  shortLabelKey?: string;
  icon: LucideIcon;
};

type NavEntry =
  | NavDirectLink
  | ({ type: "group" } & NavGroup);

const NAV_ENTRIES: NavEntry[] = [
  {
    type: "link",
    to: "/",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
  },
  {
    type: "group",
    id: "operations",
    labelKey: "nav.operations",
    collapsible: true,
    defaultOpen: true,
    items: [
      { to: "/manufacturing", labelKey: "nav.manufacturing", shortLabelKey: "nav.manufacturingShort", icon: Factory },
      { to: "/purchasing", labelKey: "nav.purchasing", icon: ClipboardList },
      { to: "/supply-chain", labelKey: "nav.supplyChain", icon: Truck },
      { to: "/inventory", labelKey: "nav.inventory", icon: Package },
      { to: "/imports", labelKey: "nav.imports", icon: Ship },
      { to: "/blind-spot-vault", labelKey: "nav.tribalKnowledgeVault", shortLabelKey: "nav.vaultShort", icon: BookMarked },
    ],
  },
  {
    type: "link",
    to: "/pos",
    labelKey: "nav.pointOfSale",
    shortLabelKey: "nav.posShort",
    icon: ScanLine,
  },
  {
    type: "group",
    id: "finance",
    labelKey: "nav.finance",
    collapsible: true,
    defaultOpen: true,
    items: [
      { to: "/finance-workspace", labelKey: "nav.financeWorkspace", shortLabelKey: "nav.financeShort", icon: Landmark },
      { to: "/finance-reports", labelKey: "nav.financeReports", shortLabelKey: "nav.reportsShort", icon: ClipboardList },
      { to: "/accounting", labelKey: "nav.generalLedger", shortLabelKey: "nav.glShort", icon: BookOpenText },
      { to: "/finance-rev-rec", labelKey: "nav.revRecWip", shortLabelKey: "nav.revRecShort", icon: CircleDollarSign },
      { to: "/customer-360", labelKey: "nav.customer360", shortLabelKey: "nav.customer360Short", icon: Users },
      { to: "/ar", labelKey: "nav.accountsReceivable", shortLabelKey: "nav.arShort", icon: Receipt },
      { to: "/customer-ledger", labelKey: "nav.customerLedger", shortLabelKey: "nav.customerLedgerShort", icon: Receipt },
      { to: "/ap", labelKey: "nav.accountsPayable", shortLabelKey: "nav.apShort", icon: Wallet },
      { to: "/finance-po-approvals", labelKey: "nav.poApprovals", shortLabelKey: "nav.poApprovals", icon: ClipboardList },
      { to: "/vendor-ledger", labelKey: "nav.vendorLedger", shortLabelKey: "nav.vendorLedgerShort", icon: Wallet },
      { to: "/sales-invoicing", labelKey: "nav.salesInvoicing", shortLabelKey: "nav.invoicingShort", icon: ClipboardList },
      { to: "/finance-bank", labelKey: "nav.bankReconciliation", shortLabelKey: "nav.bankRecShort", icon: Building2 },
      { to: "/finance-assets", labelKey: "nav.fixedAssets", shortLabelKey: "nav.assetsShort", icon: TrendingDown },
      { to: "/finance-budgets", labelKey: "nav.budgetsVariance", shortLabelKey: "nav.budgetsShort", icon: PiggyBank },
      { to: "/finance-tax", labelKey: "nav.taxEngine", shortLabelKey: "nav.taxShort", icon: Percent },
      { to: "/finance-currency", labelKey: "nav.currencyConsolidation", shortLabelKey: "nav.fxShort", icon: Coins },
    ],
  },
  {
    type: "link",
    to: "/crm",
    labelKey: "nav.crm",
    shortLabelKey: "nav.crmShort",
    icon: Users,
  },
  {
    type: "group",
    id: "hr-payroll",
    labelKey: "nav.hrPayroll",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/hr-employees", labelKey: "nav.employees", shortLabelKey: "nav.createEmployeeShort", icon: UserPlus },
      { to: "/hr-timecards", labelKey: "nav.timecards", shortLabelKey: "nav.hrManagementShort", icon: Clock },
      { to: "/hr-payroll-runs", labelKey: "nav.payrollRuns", shortLabelKey: "nav.payrollShort", icon: BadgeDollarSign },
      { to: "/hr-payroll-config", labelKey: "nav.payrollConfiguration", shortLabelKey: "nav.payrollConfigShort", icon: BadgeDollarSign },
    ],
  },
  {
    type: "group",
    id: "admin",
    labelKey: "nav.administration",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/locations", labelKey: "nav.storesLocations", shortLabelKey: "nav.locationsShort", icon: MapPin },
      { to: "/data-import", labelKey: "nav.dataImport", icon: FileUp },
      { to: "/users", labelKey: "nav.userManagement", shortLabelKey: "nav.usersShort", icon: UserCog },
      { to: "/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
  {
    type: "group",
    id: "support",
    labelKey: "nav.support",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/help", labelKey: "nav.userGuideHelp", shortLabelKey: "nav.helpShort", icon: LifeBuoy },
      { to: "/activity-log", labelKey: "nav.activityLog", shortLabelKey: "nav.activityShort", icon: LifeBuoy },
    ],
  },
];

const COLLAPSE_KEY = "benben.sidebar.groups.v1";

function readCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeCollapsed(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state));
}

function isActivePath(path: string, to: string) {
  return path === to || (to !== "/" && path.startsWith(to));
}

function groupHasActive(path: string, items: NavItem[]) {
  return items.some((item) => isActivePath(path, item.to));
}

function navLinkClass(active: boolean) {
  return `flex min-h-[34px] items-center gap-2 rounded-md px-2 py-1.5 text-[13px] leading-tight transition-colors ${
    active
      ? "bg-white/12 font-medium text-slate-ink-fg ring-1 ring-inset ring-white/10"
      : "text-slate-ink-muted hover:bg-white/5 hover:text-slate-ink-fg"
  }`;
}

type Props = {
  sessionOrgName: string;
  sessionOrgId: string;
  online: boolean;
};

export function AppSidebar({ sessionOrgName, sessionOrgId, online }: Props) {
  const { t } = useTranslation();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const role = useRole();
  const acting = getActingRole();
  const realAdmin = isAdmin();
  const brandFallback = t("nav.brandFallback");

  const visibleEntries = useMemo(() => {
    return NAV_ENTRIES.map((entry) => {
      if (entry.type === "link") {
        if (!canAccess(entry.to, role) && !(realAdmin && entry.to === "/users")) return null;
        return entry;
      }
      const items = entry.items.filter(
        (item) => canAccess(item.to, role) || (realAdmin && item.to === "/users"),
      );
      if (!items.length) return null;
      return { ...entry, items };
    }).filter(Boolean) as NavEntry[];
  }, [role, realAdmin]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = readCollapsed();
    const initial: Record<string, boolean> = {};
    for (const e of NAV_ENTRIES) {
      if (e.type !== "group") continue;
      const stored = saved[e.id];
      initial[e.id] = stored !== undefined ? !stored : e.defaultOpen;
    }
    return initial;
  });

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const e of visibleEntries) {
        if (e.type === "group" && e.collapsible && groupHasActive(path, e.items) && !next[e.id]) {
          next[e.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [path, visibleEntries]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      const collapsed: Record<string, boolean> = {};
      for (const e of NAV_ENTRIES) {
        if (e.type === "group" && e.collapsible) collapsed[e.id] = !next[e.id];
      }
      writeCollapsed(collapsed);
      return next;
    });
  }

  return (
    <aside className="hidden w-[15.5rem] shrink-0 flex-col bg-slate-ink text-slate-ink-fg md:flex">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand text-brand-foreground">
          <CircleDot className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold tracking-tight" title={getCompanyName(brandFallback)}>
            {getCompanyName(brandFallback)}
          </div>
          <div className="truncate text-[9px] uppercase tracking-wider text-slate-ink-muted">{t("nav.productName")}</div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2" aria-label={t("nav.mainAria")}>
        {visibleEntries.map((entry) => {
          if (entry.type === "link") {
            const active = isActivePath(path, entry.to);
            const label = t(entry.labelKey);
            const display = entry.shortLabelKey ? t(entry.shortLabelKey) : label;
            return (
              <Link
                key={entry.to}
                to={entry.to}
                title={label}
                className={`mb-0.5 ${navLinkClass(active)}`}
              >
                <entry.icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span className="truncate">{display}</span>
              </Link>
            );
          }

          const isOpen = !entry.collapsible || openGroups[entry.id];
          const groupActive = groupHasActive(path, entry.items);
          const groupLabel = t(entry.labelKey);

          return (
            <section key={entry.id} className="mb-1">
              {entry.collapsible ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.id)}
                  aria-expanded={isOpen}
                  className={`flex min-h-[28px] w-full items-center gap-1 rounded px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    groupActive ? "text-slate-ink-fg" : "text-slate-ink-muted hover:text-slate-ink-fg"
                  }`}
                >
                  <ChevronRight
                    className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{groupLabel}</span>
                  <span className="tabular-nums text-[9px] font-normal normal-case text-slate-ink-muted">
                    {entry.items.length}
                  </span>
                </button>
              ) : (
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-ink-muted">
                  {groupLabel}
                </div>
              )}

              {isOpen && (
                <ul className={entry.collapsible ? "mt-0.5 space-y-px pl-1" : "mt-0.5 space-y-px"}>
                  {entry.items.map((item) => {
                    const active = isActivePath(path, item.to);
                    const label = t(item.labelKey);
                    const display = item.shortLabelKey ? t(item.shortLabelKey) : label;
                    return (
                      <li key={item.to}>
                        <Link to={item.to} title={label} className={navLinkClass(active)}>
                          <item.icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          <span className="truncate">{display}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-white/5 px-3 py-2 text-[10px] text-slate-ink-muted">
        <div className="flex items-center gap-1.5">
          {online ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3 text-warning" />}
          <span className="truncate">{online ? "Online" : "Offline · queue active"}</span>
        </div>
        <div className="flex items-center gap-1.5" title={sessionOrgId}>
          <ShieldCheck className="h-3 w-3 shrink-0" />
          <span className="truncate">{sessionOrgName}</span>
        </div>
        <div className="truncate capitalize">
          Role: {role}
          {acting ? " · preview" : ""}
        </div>
      </div>
    </aside>
  );
}
