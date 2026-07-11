// Global workspace / company branding store.
// Holds the company-wide name set during First-Time Setup. Used for the
// sidebar branding, invoice headers, receipt templates, and dashboard.

const WORKSPACE_KEY = "benben.workspace.v1";

export interface Workspace {
  name: string;
  initializedAt: string;
}

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function subscribeWorkspace(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getWorkspace(): Workspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem(WORKSPACE_KEY) ??
      localStorage.getItem("nexuscore.workspace.v1");
    return raw ? (JSON.parse(raw) as Workspace) : null;
  } catch {
    return null;
  }
}

export function isWorkspaceInitialized(): boolean {
  return !!getWorkspace();
}

export function setWorkspace(name: string): Workspace {
  const ws: Workspace = {
    name: name.trim() || "My Company",
    initializedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
  }
  emit();
  return ws;
}

/** Convenience: company name with safe fallback for headers/templates. */
export function getCompanyName(fallback = "Your Company"): string {
  return getWorkspace()?.name ?? fallback;
}
