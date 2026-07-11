import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, Panel } from "@/components/ui-bits";
import {
  getSession,
  listUsersInWorkspace,
  adminCreateUser,
  adminCreateUserAsync,
  DEPARTMENTS,
} from "@/lib/auth-store";
import type { Department, User as StoredUser } from "@/lib/auth-store";
import {
  ENTERPRISE_ROLES,
  getRoleFor,
  assignRole,
  isAdmin,
  subscribeRbac,
  getActingRole,
  setActingRole,
  getCurrentRole,
} from "@/lib/rbac";
import { PermissionsChecklist } from "@/components/PermissionsChecklist";
import { isDesktopShell } from "@/lib/desktop-api";
import {
  assignUserEnterpriseRole,
  deactivateUser,
  deleteUser,
  fetchOrgRoles,
  fetchOrgUsers,
  reactivateUser,
  resetUserPassword,
  updateRolePermissions,
  type OrgRoleDto,
  type OrgUserDto,
} from "@/lib/permissions-bridge";
import type { PermissionMap, Role } from "@/lib/permissions-constants";
import { mapEmployeeJobToEnterpriseRole, defaultRoleForDepartment, PROVISION_JOB_TITLES } from "@/lib/employee-job-role-map";
import { fetchActiveEmployees, isHrDesktopAvailable, type EmployeeDto } from "@/lib/hr-bridge";
import { ShieldCheck, UserCog, Eye, EyeOff, UserPlus, Copy, Check, Trash2, KeyRound } from "lucide-react";
import { ErpFormDialog } from "@/components/ErpFormDialog";
import { erp, ErpFieldLabel } from "@/components/ui-bits";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "User Management — Benben ERP" },
      { name: "description", content: "Assign departmental roles and review access for your Benben organization." },
    ],
  }),
  component: UserManagement,
});



function UserManagement() {
  const session = getSession();
  const [, force] = useState(0);
  const [teamRefresh, setTeamRefresh] = useState(0);
  useEffect(() => subscribeRbac(() => force((n) => n + 1)), []);

  if (!session) {
    return (
      <div className="rounded-md border border-border bg-card p-6 text-sm">
        Please <Link to="/login" className="text-brand underline">sign in</Link> to manage users.
      </div>
    );
  }
  if (!isAdmin()) {
    return (
      <div className="space-y-4">
        <PageHeader title="User Management" subtitle="Restricted area" />
        <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Only Admins can manage users and assign roles. Your current role is
          <span className="font-semibold"> {getCurrentRole()}</span>.
        </div>
      </div>
    );
  }

  const orgUsers: StoredUser[] = listUsersInWorkspace(session.orgId);
  const acting = getActingRole();

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        subtitle={`Enterprise roles & permission flags for ${session.orgName}. Access is enforced via boolean checklist — not hardcoded role strings.`}
      />

      <CreateUserPanel orgId={session.orgId} onCreated={() => setTeamRefresh((n) => n + 1)} />

      <TeamMembersPanel
        orgId={session.orgId}
        sessionUserId={session.userId}
        localUsers={orgUsers}
        refreshKey={teamRefresh}
      />

      {isDesktopShell() && <RolePermissionsPanel />}

      <Panel>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4" /> Role definitions
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {ENTERPRISE_ROLES.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-surface/40 p-3">
              <div className="text-sm font-semibold">{r.label}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.category}</div>
              <div className="text-xs text-muted-foreground">{r.blurb}</div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          {acting ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          Preview as role (Admin only)
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Temporarily view the application as another role to verify the Departmental Guard. Your real role remains Admin.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActingRole(null)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              !acting ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface hover:bg-surface/70"
            }`}
          >
            My role (Admin)
          </button>
          {ENTERPRISE_ROLES.filter((r) => r.id !== "admin").map((r) => (
            <button
              key={r.id}
              onClick={() => setActingRole(r.id)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                acting === r.id ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface hover:bg-surface/70"
              }`}
            >
              Preview as {r.label}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function RolePermissionsPanel() {
  const [roles, setRoles] = useState<OrgRoleDto[]>([]);
  const [selectedId, setSelectedId] = useState("finance_manager");
  const [draft, setDraft] = useState<PermissionMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await fetchOrgRoles();
        setRoles(list);
        const initial = list.find((r) => r.id === "finance_manager") ?? list[0];
        if (initial) {
          setSelectedId(initial.id);
          setDraft(initial.permissions);
        } else {
          setLoadError("No role templates were returned from the server.");
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load roles.";
        setLoadError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function selectRole(id: string) {
    setSelectedId(id);
    const role = roles.find((r) => r.id === id);
    if (role) setDraft({ ...role.permissions });
  }

  async function saveRole() {
    if (!draft || selectedId === "admin") return;
    try {
      await updateRolePermissions(selectedId, draft);
      toast.success("Role permissions saved.");
      const list = await fetchOrgRoles();
      setRoles(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    }
  }

  return (
    <Panel>
      <div className="mb-3 text-sm font-semibold">Permissions checklist (role templates)</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Toggle boolean flags per enterprise role. The Auditor profile should remain read-only (view flags only).
        User rows inherit these defaults unless overridden.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading role templates…</p>
      ) : loadError || !draft ? (
        <p className="text-sm text-destructive">{loadError ?? "Role templates unavailable."}</p>
      ) : (
        <>
          <label className="mb-3 block max-w-md">
            <span className="text-xs font-medium">Edit template</span>
            <select
              value={selectedId}
              onChange={(e) => selectRole(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.category})
                </option>
              ))}
            </select>
          </label>
          <PermissionsChecklist
            value={draft}
            onChange={setDraft}
            readOnly={selectedId === "admin"}
          />
          <button
            type="button"
            disabled={selectedId === "admin"}
            onClick={() => void saveRole()}
            className="mt-4 h-9 rounded-md bg-slate-ink px-4 text-sm font-medium text-slate-ink-fg disabled:opacity-50"
          >
            Save role template
          </button>
        </>
      )}
    </Panel>
  );
}

function permissionsDiffer(a: PermissionMap, b: PermissionMap): boolean {
  return (Object.keys(a) as (keyof PermissionMap)[]).some((k) => a[k] !== b[k]);
}

function CreateUserPanel({ orgId, onCreated }: { orgId: string; onCreated?: () => void }) {
  const session = getSession();
  const desktop = isDesktopShell();
  const desktopHr = desktop && isHrDesktopAvailable();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [department, setDepartment] = useState<Department>("Sales");
  const [jobTitle, setJobTitle] = useState("");
  const [tempPassword, setTempPassword] = useState(() => generateTempPassword());
  const [linkedEmployeeId, setLinkedEmployeeId] = useState("");
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [orgRoles, setOrgRoles] = useState<OrgRoleDto[]>([]);
  const [mappedRoleId, setMappedRoleId] = useState<Role>("warehouse_clerk");
  const [permissionDraft, setPermissionDraft] = useState<PermissionMap | null>(null);
  const [roleTemplate, setRoleTemplate] = useState<PermissionMap | null>(null);
  const [showPermissionOverrides, setShowPermissionOverrides] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    void (async () => {
      try {
        const roles = await fetchOrgRoles();
        setOrgRoles(roles);
        const defaultRole = roles.find((r) => r.id === "warehouse_clerk") ?? roles[0];
        if (defaultRole) applyRoleTemplate(defaultRole.id as Role, roles);
      } catch {
        /* provisioning still works with default role id */
      }
    })();
  }, [desktop]);

  useEffect(() => {
    if (!desktopHr) return;
    void (async () => {
      try {
        const emps = await fetchActiveEmployees();
        setEmployees(emps);
      } catch {
        /* optional — provisioning works without employee link */
      }
    })();
  }, [desktopHr]);

  function onDepartmentChange(next: Department) {
    setDepartment(next);
    const roleId = defaultRoleForDepartment(next);
    if (orgRoles.some((r) => r.id === roleId)) applyRoleTemplate(roleId);
  }

  function onJobTitleChange(next: string) {
    setJobTitle(next);
    if (!next.trim()) return;
    const roleId = mapEmployeeJobToEnterpriseRole({ jobTitle: next });
    if (orgRoles.some((r) => r.id === roleId)) applyRoleTemplate(roleId);
  }

  function applyRoleTemplate(roleId: Role, roles = orgRoles) {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;
    setMappedRoleId(roleId);
    setRoleTemplate(role.permissions);
    setPermissionDraft({ ...role.permissions });
  }

  function onEmployeeLinkChange(employeeId: string) {
    setLinkedEmployeeId(employeeId);
    if (!employeeId) return;
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    if (!name.trim()) setName(emp.name);
    if (emp.jobTitle) setJobTitle(emp.jobTitle);
    const roleId = mapEmployeeJobToEnterpriseRole({
      jobTitle: emp.jobTitle,
      taxClassification: emp.taxClassification,
      status: emp.status,
    });
    applyRoleTemplate(roleId);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCreated(null);
    setSaving(true);
    try {
      const override =
        permissionDraft && roleTemplate && permissionsDiffer(permissionDraft, roleTemplate)
          ? permissionDraft
          : null;

      let createdUsername: string;
      if (isDesktopShell()) {
        const res = await adminCreateUserAsync({
          name,
          username,
          department,
          tempPassword,
          orgId,
          orgName: session?.orgName ?? "My Company",
          roleId: mappedRoleId,
          permissionsOverride: permissionDraft ? override : null,
          employeeId: linkedEmployeeId.trim() || null,
        });
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        assignRole(res.user.id, mappedRoleId);
        createdUsername = res.user.username;
      } else {
        const res = adminCreateUser({ name, username, department, tempPassword });
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        createdUsername = res.user.username;
      }

      setCreated({ username: createdUsername, tempPassword });
      onCreated?.();
      setName("");
      setUsername("");
      setJobTitle("");
      setLinkedEmployeeId("");
      setShowPermissionOverrides(false);
      setTempPassword(generateTempPassword());
      const defaultRole = orgRoles.find((r) => r.id === "warehouse_clerk") ?? orgRoles[0];
      if (defaultRole) applyRoleTemplate(defaultRole.id as Role);
      else {
        setPermissionDraft(null);
        setRoleTemplate(null);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <div className="relative isolate z-10">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <UserPlus className="h-4 w-4" /> Provision system user account
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        HR employee records (HR / Payroll module) are separate from login accounts. Creating an employee in HR
        does <span className="font-semibold">not</span> create system access. Link an optional active employee
        record below to auto-map permissions from their job title. Workspace:{" "}
        <span className="font-mono">{orgId}</span>.
      </p>
      <form onSubmit={(e) => void submit(e)} className="grid gap-3 md:grid-cols-2">
        <div className="block">
          <label htmlFor="create-user-name" className="text-xs font-medium">
            Full name
          </label>
          <input
            id="create-user-name"
            name="displayName"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Alex Morgan"
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="block">
          <label htmlFor="create-user-username" className="text-xs font-medium">
            Username
          </label>
          <input
            id="create-user-username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="alex.morgan"
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="block">
          <label htmlFor="create-user-department" className="text-xs font-medium">
            Department
          </label>
          <select
            id="create-user-department"
            name="department"
            value={department}
            onChange={(e) => onDepartmentChange(e.target.value as Department)}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="block">
          <label htmlFor="create-user-job-title" className="text-xs font-medium">
            Job title / classification
          </label>
          <input
            id="create-user-job-title"
            name="jobTitle"
            type="text"
            list="create-user-job-title-presets"
            value={jobTitle}
            onChange={(e) => onJobTitleChange(e.target.value)}
            placeholder="e.g. HR Manager, HR Staff, Finance Manager"
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <datalist id="create-user-job-title-presets">
            {PROVISION_JOB_TITLES.map(({ label }) => (
              <option key={label} value={label} />
            ))}
          </datalist>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Maps to an enterprise role template automatically (HR Manager → payroll admin, HR Staff → HR module access).
          </p>
        </div>
        {desktopHr && (
          <div className="block md:col-span-2">
            <label htmlFor="create-user-employee" className="text-xs font-medium">
              Link to active employee record (optional)
            </label>
            <select
              id="create-user-employee"
              value={linkedEmployeeId}
              onChange={(e) => onEmployeeLinkChange(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              <option value="">— No employee link —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} · {emp.jobTitle}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="block">
          <label htmlFor="create-user-password" className="text-xs font-medium">
            Temporary password
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="create-user-password"
              name="tempPassword"
              type="text"
              autoComplete="new-password"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              required
              className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <button
              type="button"
              onClick={() => setTempPassword(generateTempPassword())}
              className="rounded-md border border-border bg-surface px-2 text-xs hover:bg-surface/70"
            >
              Regenerate
            </button>
          </div>
        </div>
        {desktop && permissionDraft && (
          <div className="md:col-span-2 space-y-2 rounded-md border border-border bg-surface/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium">
                Mapped enterprise role:{" "}
                <span className="font-mono text-brand">{mappedRoleId}</span>
                {linkedEmployeeId ? " (from HR job title — adjust overrides below if needed)" : null}
              </div>
              <label htmlFor="create-user-role" className="block min-w-[12rem] flex-1 max-w-md">
                <span className="text-xs text-muted-foreground">Role template</span>
                <select
                  id="create-user-role"
                  value={mappedRoleId}
                  onChange={(e) => applyRoleTemplate(e.target.value as Role)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  {orgRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => setShowPermissionOverrides((v) => !v)}
              className="text-xs font-medium text-brand hover:underline"
            >
              {showPermissionOverrides ? "Hide permission overrides" : "Customize permission overrides (optional)"}
            </button>
            {showPermissionOverrides && (
              <PermissionsChecklist
                value={permissionDraft}
                onChange={setPermissionDraft}
                readOnly={mappedRoleId === "admin"}
              />
            )}
          </div>
        )}
        {err && (
          <div className="md:col-span-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}
        {created && (
          <div className="md:col-span-2 rounded-md border border-success/30 bg-success/10 p-3 text-xs">
            <div className="font-medium text-success">Account created for {created.username}.</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-muted-foreground">Share this temporary password securely:</span>
              <code className="select-all rounded bg-background px-2 py-0.5 font-mono">{created.tempPassword}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(created.tempPassword);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="h-9 rounded-md bg-slate-ink px-4 text-sm font-medium text-slate-ink-fg hover:bg-slate-ink-2 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
      </div>
    </Panel>
  );
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + "!";
}

type TeamMemberRow = StoredUser & { isActive: boolean; desktopRole?: string };

function mapOrgUsersToRows(
  remote: OrgUserDto[],
  orgId: string,
  localUsers: StoredUser[],
): TeamMemberRow[] {
  return remote.map((ou) => {
    const local =
      localUsers.find((u) => u.id === ou.id) ?? localUsers.find((u) => u.username === ou.username);
    return {
      id: ou.id,
      username: ou.username,
      name: ou.name,
      passwordHash: local?.passwordHash ?? "",
      orgId,
      orgName: local?.orgName ?? "",
      department: local?.department ?? ("Admin" as Department),
      role: local?.role ?? "user",
      must_change_password: ou.mustChangePassword,
      isActive: ou.isActive,
      createdAt: ou.createdAt,
      desktopRole: ou.role,
    };
  });
}

function AccountStatusBadge({ isActive, mustChangePassword }: { isActive: boolean; mustChangePassword?: boolean }) {
  if (!isActive) {
    return (
      <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
        Inactive
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success">
        Active
      </span>
      {mustChangePassword && (
        <span className="text-[10px] text-warning">Password reset pending</span>
      )}
    </span>
  );
}

function TeamMembersPanel({
  orgId,
  sessionUserId,
  localUsers,
  refreshKey,
}: {
  orgId: string;
  sessionUserId: string;
  localUsers: StoredUser[];
  refreshKey: number;
}) {
  const [rows, setRows] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<TeamMemberRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetCopied, setResetCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        if (isDesktopShell()) {
          const remote = await fetchOrgUsers();
          setRows(mapOrgUsersToRows(remote, orgId, localUsers));
        } else {
          setRows(localUsers.map((u) => ({ ...u, isActive: u.isActive !== false })));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load team members.");
        setRows(localUsers.map((u) => ({ ...u, isActive: u.isActive !== false })));
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId, localUsers, refreshKey]);

  async function runLifecycle(
    userId: string,
    action: "deactivate" | "reactivate" | "delete",
  ) {
    if (!isDesktopShell()) {
      toast.error("Account lifecycle controls require the Benben desktop app.");
      return;
    }
    if (action === "delete") {
      const ok = window.confirm(
        "Permanently delete this account? If audit history blocks deletion, the account will be deactivated instead.",
      );
      if (!ok) return;
    }
    setActionUserId(userId);
    try {
      if (action === "deactivate") {
        setRows((prev) =>
          prev.map((r) => (r.id === userId ? { ...r, isActive: false } : r)),
        );
        await deactivateUser(userId);
        toast.success("Account deactivated.");
      } else if (action === "reactivate") {
        setRows((prev) =>
          prev.map((r) => (r.id === userId ? { ...r, isActive: true } : r)),
        );
        await reactivateUser(userId);
        toast.success("Account reactivated.");
      } else {
        const result = await deleteUser(userId);
        if (result.deleted) {
          setRows((prev) => prev.filter((r) => r.id !== userId));
          toast.success("Account deleted.");
        } else if ("notice" in result) {
          setRows((prev) =>
            prev.map((r) =>
              r.id === userId ? { ...r, isActive: false } : r,
            ),
          );
          toast.warning(result.notice);
        }
      }
      const remote = await fetchOrgUsers();
      setRows(mapOrgUsersToRows(remote, orgId, localUsers));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActionUserId(null);
    }
  }

  function openResetDialog(user: TeamMemberRow) {
    setResetTarget(user);
    setResetPassword(generateTempPassword());
    setResetCopied(false);
  }

  function closeResetDialog() {
    setResetTarget(null);
    setResetPassword("");
    setResetCopied(false);
  }

  async function submitPasswordReset() {
    if (!resetTarget || !isDesktopShell()) return;
    if (!resetPassword || resetPassword.length < 8) {
      toast.error("Temporary password must be at least 8 characters.");
      return;
    }
    setResetSaving(true);
    setActionUserId(resetTarget.id);
    try {
      const updated = await resetUserPassword(resetTarget.id, resetPassword);
      setRows((prev) =>
        prev.map((r) =>
          r.id === resetTarget.id
            ? { ...r, must_change_password: updated.mustChangePassword }
            : r,
        ),
      );
      toast.success(`Password reset for ${resetTarget.username}. Share the temporary password securely.`);
      setResetCopied(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Password reset failed.");
    } finally {
      setResetSaving(false);
      setActionUserId(null);
    }
  }

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <UserCog className="h-4 w-4" /> Team members
        </div>
        {!isDesktopShell() && (
          <p className="text-xs text-muted-foreground">
            Deactivate, delete, and password reset require the Benben desktop app.
          </p>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading team members…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Username</th>
                <th className="px-2 py-2 font-medium">Department</th>
                <th className="px-2 py-2 font-medium">Enterprise role</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const role = (u.desktopRole as Role | undefined) ?? getRoleFor(u.id);
                const isSelf = u.id === sessionUserId;
                const busy = actionUserId === u.id;
                const desktop = isDesktopShell();
                return (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-2 py-2">
                      {u.name}
                      {isSelf && (
                        <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                          YOU
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{u.username}</td>
                    <td className="px-2 py-2 text-muted-foreground">{u.department}</td>
                    <td className="px-2 py-2">
                      <select
                        value={role}
                        disabled={!u.isActive || busy}
                        onChange={async (e) => {
                          const next = e.target.value as Role;
                          assignRole(u.id, next);
                          if (isDesktopShell()) {
                            try {
                              await assignUserEnterpriseRole(u.id, next);
                              toast.success(`Role updated to ${next}`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Role update failed.");
                            }
                          }
                        }}
                        className="h-8 rounded-md border border-border bg-background px-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
                      >
                        {ENTERPRISE_ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <AccountStatusBadge
                        isActive={u.isActive}
                        mustChangePassword={u.must_change_password}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy || !desktop || !u.isActive}
                            onClick={() => openResetDialog(u)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <KeyRound className="h-3.5 w-3.5" aria-hidden />
                            Reset password
                          </button>
                          <button
                            type="button"
                            disabled={busy || !desktop}
                            onClick={() =>
                              void runLifecycle(
                                u.id,
                                u.isActive ? "deactivate" : "reactivate",
                              )
                            }
                            className="h-8 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? "…" : u.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            disabled={busy || !desktop}
                            onClick={() => void runLifecycle(u.id, "delete")}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ErpFormDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) closeResetDialog();
        }}
        title="Reset user password"
        description={
          resetTarget
            ? `Set a new temporary password for ${resetTarget.name} (${resetTarget.username}). They will be signed out of all sessions and prompted to choose a new password on next login.`
            : undefined
        }
        submitLabel={resetSaving ? "Resetting…" : "Reset password"}
        submitDisabled={resetSaving || resetPassword.length < 8}
        onSubmit={() => void submitPasswordReset()}
        onCancel={closeResetDialog}
        size="md"
      >
        <label className="block">
          <ErpFieldLabel>Temporary password</ErpFieldLabel>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              autoComplete="new-password"
              className={`${erp.input} font-mono`}
              minLength={8}
              required
            />
            <button
              type="button"
              onClick={() => {
                setResetPassword(generateTempPassword());
                setResetCopied(false);
              }}
              className="shrink-0 rounded-md border border-border bg-surface px-2 text-xs hover:bg-surface/70"
            >
              Regenerate
            </button>
          </div>
        </label>
        {resetPassword.length >= 8 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Share securely:</span>
            <code className="select-all rounded bg-surface px-2 py-0.5 font-mono text-foreground">
              {resetPassword}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(resetPassword);
                setResetCopied(true);
                setTimeout(() => setResetCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5"
            >
              {resetCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {resetCopied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </ErpFormDialog>
    </Panel>
  );
}
