import type { BlindSpotCategory, BlindSpotSeverity } from "./blind-spot-store";

export const BLIND_SPOT_CATEGORY_OPTIONS = [
  { value: "operational" as const, label: "Operational Quirk" },
  { value: "client" as const, label: "Client Preference" },
  { value: "quality" as const, label: "Machine Limitation" },
];

export const BLIND_SPOT_SEVERITY_OPTIONS = [
  { value: "high" as const, label: "Critical" },
  { value: "medium" as const, label: "Warning" },
  { value: "low" as const, label: "Optimization" },
];

export function categoryLabel(category: BlindSpotCategory): string {
  return BLIND_SPOT_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category;
}

export function severityLabel(severity: BlindSpotSeverity): string {
  return BLIND_SPOT_SEVERITY_OPTIONS.find((o) => o.value === severity)?.label ?? severity;
}

export function targetBindingLabel(entry: {
  sku?: string;
  customerCode?: string;
  partyId?: string;
}): string {
  if (entry.sku) return `SKU · ${entry.sku}`;
  if (entry.customerCode) return `Customer · ${entry.customerCode}`;
  if (entry.partyId) return `CRM account · ${entry.partyId}`;
  return "Global (all contexts)";
}

const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "mkv", "m4v"];

/** Resolve a stored blind-spot video path to a renderer-safe local-media URL. */
export function toBlindSpotVideoUrl(videoFilePath?: string | null): string | null {
  if (!videoFilePath?.trim()) return null;
  const raw = videoFilePath.trim().replace(/\\/g, "/");
  if (raw.startsWith("local-media://")) {
    // Normalize legacy two-slash URLs (host parsed as first path segment)
    if (!raw.startsWith("local-media:///")) {
      try {
        const parsed = new URL(raw);
        if (parsed.hostname) {
          const tail = parsed.pathname.replace(/^\/+/, "");
          const relative = tail ? `${parsed.hostname}/${tail}` : parsed.hostname;
          return `local-media:///${relative}`;
        }
      } catch {
        return raw;
      }
    }
    return raw;
  }
  return `local-media:///${raw.replace(/^\/+/, "")}`;
}

export function getPathForDroppedFile(file: File): string | null {
  try {
    return window.benben?.files?.getPathForDroppedFile?.(file) ?? null;
  } catch {
    return null;
  }
}

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && VIDEO_EXTENSIONS.includes(ext);
}
