/**
 * Renderer bridge to main-process AI agentry (window.api.sendAiQuery).
 */

export type AiResponseKind = "success" | "missing_key" | "offline" | "auth" | "unavailable" | "error";

export type AiQueryResult = {
  ok: boolean;
  text: string;
  kind: AiResponseKind;
};

const MISSING_KEY_MARKERS = ["not configured", "BENBEN_AI_KEY", "aiApiKey"];
const OFFLINE_MARKERS = ["internet connection", "Cannot reach the AI service"];

function classifyAssistantText(text: string): AiResponseKind {
  const lower = text.toLowerCase();
  if (MISSING_KEY_MARKERS.some((m) => lower.includes(m.toLowerCase()))) return "missing_key";
  if (OFFLINE_MARKERS.some((m) => lower.includes(m.toLowerCase()))) return "offline";
  return "success";
}

export function isAiDesktopAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.api?.sendAiQuery === "function";
}

export async function sendAiQuery(prompt: string): Promise<AiQueryResult> {
  if (!isAiDesktopAvailable()) {
    return {
      ok: false,
      text: "AI Copilot runs inside the Benben desktop app. Open the packaged Electron build to use natural-language queries.",
      kind: "unavailable",
    };
  }

  const res = await window.api!.sendAiQuery(prompt);
  if (!res.ok) {
    return {
      ok: false,
      text: res.error ?? "Could not reach the AI assistant.",
      kind: "auth",
    };
  }

  const kind = classifyAssistantText(res.data);
  return { ok: kind === "success", text: res.data, kind };
}

export async function desktopSaveAiApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const api = window.benben?.ai;
  if (!api?.saveApiKey) {
    return { ok: false, error: "Save API key is only available in the desktop app." };
  }
  const res = await api.saveApiKey(apiKey);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

export async function desktopAiConfigured(): Promise<boolean> {
  const api = window.benben?.ai;
  if (!api?.getStatus) return false;
  const res = await api.getStatus();
  return Boolean(res.ok && res.data?.configured);
}
