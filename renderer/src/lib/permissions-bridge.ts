import type { PermissionMap } from "./permissions-constants";
import { isLanMode } from "./lan-mode";
import { lanApiFetch } from "./lan-api-client";

export type OrgRoleDto = {
  id: string;
  label: string;
  category: string | null;
  permissions: PermissionMap;
};

export type OrgUserDto = {
  id: string;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

export type DeleteUserResult =
  | { ok: true; deleted: true; userId: string }
  | { ok: true; deleted: false; deactivated: true; notice: string; user: OrgUserDto };

function permissionsApi() {
  const api = window.benben?.permissions;
  if (!api) throw new Error("Permissions API requires the Benben desktop app.");
  return api;
}

export async function fetchOrgRoles(): Promise<OrgRoleDto[]> {
  if (isLanMode()) {
    const res = await lanApiFetch<{ data: OrgRoleDto[] }>("/api/permissions/roles");
    return res.data ?? [];
  }
  const res = await permissionsApi().listRoles();
  if (!res.ok) throw new Error(res.error ?? "Failed to load roles.");
  return (res.data ?? []) as OrgRoleDto[];
}

export async function fetchOrgUsers(): Promise<OrgUserDto[]> {
  if (isLanMode()) {
    const res = await lanApiFetch<{ data: OrgUserDto[] }>("/api/permissions/users");
    return res.data ?? [];
  }
  const res = await permissionsApi().listUsers();
  if (!res.ok) throw new Error(res.error ?? "Failed to load users.");
  return (res.data ?? []) as OrgUserDto[];
}

export async function deactivateUser(userId: string): Promise<OrgUserDto> {
  const res = await permissionsApi().deactivateUser(userId);
  if (!res.ok) throw new Error(res.error ?? "Failed to deactivate user.");
  return (res.data as { user: OrgUserDto }).user;
}

export async function reactivateUser(userId: string): Promise<OrgUserDto> {
  const res = await permissionsApi().reactivateUser(userId);
  if (!res.ok) throw new Error(res.error ?? "Failed to reactivate user.");
  return (res.data as { user: OrgUserDto }).user;
}

export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  const res = await permissionsApi().deleteUser(userId);
  if (!res.ok) throw new Error(res.error ?? "Failed to delete user.");
  return res.data as DeleteUserResult;
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<OrgUserDto> {
  if (isLanMode()) {
    const res = await lanApiFetch<{ data: { user: OrgUserDto } }>(
      `/api/permissions/users/${encodeURIComponent(userId)}/reset-password`,
      {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      },
    );
    return res.data.user;
  }
  const res = await permissionsApi().resetUserPassword(userId, newPassword);
  if (!res.ok) throw new Error(res.error ?? "Failed to reset password.");
  return (res.data as { user: OrgUserDto }).user;
}

export async function updateRolePermissions(
  roleId: string,
  permissions: Partial<PermissionMap>,
): Promise<void> {
  const res = await permissionsApi().updateRole(roleId, permissions);
  if (!res.ok) throw new Error(res.error ?? "Failed to update role.");
}

export async function assignUserEnterpriseRole(
  userId: string,
  roleId: string,
  permissionsOverride?: Partial<PermissionMap> | null,
): Promise<void> {
  const res = await permissionsApi().assignUserRole(userId, roleId, permissionsOverride);
  if (!res.ok) throw new Error(res.error ?? "Failed to assign role.");
}
