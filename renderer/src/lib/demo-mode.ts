// Demo Mode global flag (`isDemoMode`).
// Defaults to true. When cleared, all ERP surfaces show empty production sandboxes.
//
// Do not import demo-data-reset here — stores import this module at init, and
// demo-data-reset imports those stores (circular dependency → blank UI).

const KEY = "benben.demo_mode.v1";

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function subscribeDemoMode(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Returns true when sample data should be shown (default on first launch). */
export function isDemoMode(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return true;
  return raw === "true";
}

export function setDemoMode(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(value));
  emit();
}

/**
 * Permanently clear sample data and switch the workspace into clean production mode.
 * Sets isDemoMode to false and wipes all module stores.
 */
export function clearDemoData(): void {
  setDemoMode(false);
  void import("./demo-data-reset").then(({ wipeSandboxData }) => {
    wipeSandboxData();
    emit();
  });
}

/** Re-enable bundled sample data (e.g. after a prior clear). Reloads the app to re-seed stores. */
export function restoreDemoSampleData(): void {
  if (typeof window === "undefined") return;
  setDemoMode(true);
  void import("./demo-keys").then(({ DEMO_MODULE_STORAGE_KEYS }) => {
    for (const key of DEMO_MODULE_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
    void import("./demo-seed").then(({ seedDemoWorkspaceMetadata, enrichDemoModuleNotes }) => {
      seedDemoWorkspaceMetadata();
      enrichDemoModuleNotes();
    });
    window.location.reload();
  });
}
