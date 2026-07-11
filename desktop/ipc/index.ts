import { registerAppIpc } from "./app.ipc";
import { registerAuthIpc } from "./auth.ipc";
import { registerBackupIpc } from "./backup.ipc";
import { registerDialogIpc } from "./dialog.ipc";
import { registerEmailIpc } from "./email.ipc";
import { registerSystemIpc } from "./system.ipc";
import { registerUpdateIpc } from "./update.ipc";
import { registerSupportIpc } from "./support.ipc";
import { registerHrIpc } from "./hr.ipc";
import { registerPayrollIpc } from "./payroll.ipc";
import { registerPermissionsIpc } from "./permissions.ipc";
import { registerFinanceIpc } from "./finance.ipc";
import { registerAiIpc } from "./ai.ipc";
import { registerLicensingIpc } from "./licensing.ipc";
import { registerBrandingIpc } from "./branding.ipc";
import { registerOnboardingIpc } from "./onboarding.ipc";
import { registerMigrationIpc } from "./migration.ipc";
import { registerOperationsIpc } from "./operations.ipc";

export function registerAllIpcHandlers(): void {
  registerLicensingIpc();
  registerOnboardingIpc();
  registerMigrationIpc();
  registerOperationsIpc();
  registerBrandingIpc();
  registerAppIpc();
  registerAuthIpc();
  registerBackupIpc();
  registerDialogIpc();
  registerEmailIpc();
  registerSystemIpc();
  registerUpdateIpc();
  registerSupportIpc();
  registerHrIpc();
  registerPayrollIpc();
  registerPermissionsIpc();
  registerFinanceIpc();
  registerAiIpc();
}

export { registerLicensingIpc };
export { registerOnboardingIpc };
export { registerMigrationIpc };
export { registerOperationsIpc };
