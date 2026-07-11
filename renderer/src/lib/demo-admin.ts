/**
 * Admin demo environment controls (Settings → System).
 * Preserves workspace name and auth session unless full reset is chosen.
 */

import { clearDemoData, restoreDemoSampleData, setDemoMode, isDemoMode } from "./demo-mode";
import { DEMO_MODULE_STORAGE_KEYS } from "./demo-keys";
import { getWorkspace, setWorkspace } from "./workspace-store";
import { publishErpChange } from "./erp-sync";

export type DemoResetOptions = {
  /** Keep company/workspace branding from setup. */
  preserveWorkspace: boolean;
  /** After clear, reload with demo seeds. */
  reseedAfter: boolean;
  /** Also clear import history and demo document metadata. */
  clearAuxiliaryKeys: boolean;
};

export type DemoResetProgress = {
  step: string;
  percent: number;
};

const AUX_KEYS = [
  "benben.data_import.history.v1",
  "benben.demo.documents.v1",
  "benben.demo.warehouse_transfers.v1",
] as const;

export async function runDemoEnvironmentReset(
  options: DemoResetOptions,
  onProgress?: (p: DemoResetProgress) => void,
): Promise<void> {
  const workspace = options.preserveWorkspace ? getWorkspace() : null;

  onProgress?.({ step: "Clearing transactional modules…", percent: 20 });
  if (options.reseedAfter) {
    restoreDemoSampleData();
    return;
  }

  clearDemoData();

  onProgress?.({ step: "Removing auxiliary demo keys…", percent: 50 });
  if (options.clearAuxiliaryKeys && typeof window !== "undefined") {
    for (const key of AUX_KEYS) {
      window.localStorage.removeItem(key);
    }
  }

  onProgress?.({ step: "Restoring workspace profile…", percent: 80 });
  if (options.preserveWorkspace && workspace) {
    setWorkspace(workspace.name);
  }

  onProgress?.({ step: "Refreshing modules…", percent: 100 });
  publishErpChange("dashboard", "demo-reset");
  for (const mod of ["inventory", "pos", "ar", "ap", "sales", "gl", "crm"] as const) {
    publishErpChange(mod, "demo-reset");
  }
}

export function getDemoEnvironmentStatus(): {
  demoMode: boolean;
  moduleKeyCount: number;
} {
  let moduleKeyCount = 0;
  if (typeof window !== "undefined") {
    for (const key of DEMO_MODULE_STORAGE_KEYS) {
      if (window.localStorage.getItem(key)) moduleKeyCount++;
    }
  }
  return { demoMode: isDemoMode(), moduleKeyCount };
}
