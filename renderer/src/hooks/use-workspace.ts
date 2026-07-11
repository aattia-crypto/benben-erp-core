import { useEffect, useState } from "react";
import {
  getWorkspace,
  subscribeWorkspace,
  type Workspace,
} from "@/lib/workspace-store";

export function useWorkspace(): Workspace | null {
  const [ws, setWs] = useState<Workspace | null>(null);
  useEffect(() => {
    setWs(getWorkspace());
    return subscribeWorkspace(() => setWs(getWorkspace()));
  }, []);
  return ws;
}

export function useCompanyName(fallback = "Your Company"): string {
  const ws = useWorkspace();
  return ws?.name ?? fallback;
}
