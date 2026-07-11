import { AlertTriangle } from "lucide-react";
import { toBlindSpotVideoUrl } from "@/lib/blind-spot-labels";
import type { BlindSpotEntry } from "@/lib/blind-spot-store";

type BlindSpotVideoPlayerProps = {
  videoFilePath?: string | null;
  className?: string;
};

/** Inline HTML5 player for tribal-knowledge clips served via local-media:// */
export function BlindSpotVideoPlayer({ videoFilePath, className }: BlindSpotVideoPlayerProps) {
  const src = toBlindSpotVideoUrl(videoFilePath);
  if (!src) return null;

  return (
    <video
      className={className ?? "mt-2 w-full max-w-md rounded-md border border-border bg-black/90"}
      controls
      playsInline
      preload="metadata"
      src={src}
    />
  );
}

type BlindSpotAlertCardProps = {
  alerts: BlindSpotEntry[];
  loading?: boolean;
};

/** High-visibility tribal knowledge warning surfaced above operational line editors. */
export function BlindSpotAlertCard({ alerts, loading }: BlindSpotAlertCardProps) {
  if (loading || alerts.length === 0) return null;

  return (
    <div
      className="mb-3 rounded-md border border-[oklch(0.72_0.16_75)] bg-[oklch(0.96_0.04_85)] p-3 shadow-sm"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.45_0.12_75)]" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-sm font-semibold text-[oklch(0.38_0.08_55)]">
            Blind-Spot Ledger · operator guidance
          </div>
          <ul className="space-y-2 text-sm">
            {alerts.map((a) => (
              <li key={a.id} className="rounded border border-[oklch(0.72_0.16_75)]/40 bg-card/80 p-2">
                <div className="font-medium text-foreground">{a.title}</div>
                {a.videoFilePath ? (
                  <BlindSpotVideoPlayer
                    videoFilePath={a.videoFilePath}
                    className="mt-2 w-full max-w-sm rounded-md border border-border bg-black"
                  />
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.body}</p>
                )}
                {a.voiceTranscript ? (
                  <p className="mt-1 text-xs italic leading-relaxed text-muted-foreground">{a.voiceTranscript}</p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>{a.category}</span>
                  {a.sku ? <span>SKU {a.sku}</span> : null}
                  {a.customerCode ? <span>Account {a.customerCode}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
