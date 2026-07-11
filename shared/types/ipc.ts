/** IPC channel names — keep in sync with desktop/constants.ts */
export const IpcChannels = {
  app: {
    getVersion: "app:getVersion",
    getPaths: "app:getPaths",
    ping: "app:ping",
  },
  auth: {
    login: "auth:login",
    logout: "auth:logout",
    getSession: "auth:getSession",
    initializeAdmin: "auth:initializeAdmin",
    changePassword: "auth:changePassword",
  },
  backup: {
    create: "backup:create",
    list: "backup:list",
    restore: "backup:restore",
  },
  ai: {
    sendQuery: "ai:sendQuery",
  },
} as const;

export interface AppPathsDto {
  root: string;
  data: string;
  database: string;
  backups: string;
  exports: string;
  imports: string;
  attachments: string;
  logs: string;
  config: string;
}

export interface IpcResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AuthSessionDto {
  userId: string;
  username: string;
  name: string;
  orgId: string;
  orgName: string;
  role: string;
  department: string;
  startedAt: string;
  mustChangePassword: boolean;
  passwordResetRequired: boolean;
}

export interface BackupRecordDto {
  id: string;
  createdAt: string;
  path: string;
  bytes: number;
}
