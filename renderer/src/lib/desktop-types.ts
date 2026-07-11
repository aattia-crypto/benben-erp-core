/** Mirrors shared/types/ipc.ts AuthSessionDto — kept local for Vite build isolation. */
import type { PermissionMap } from "./permissions-constants";

export interface DesktopAuthSessionDto {
  userId: string;
  username: string;
  name: string;
  orgId: string;
  orgName: string;
  role: string;
  roleLabel?: string;
  department: string;
  startedAt: string;
  mustChangePassword: boolean;
  permissions: PermissionMap;
}
