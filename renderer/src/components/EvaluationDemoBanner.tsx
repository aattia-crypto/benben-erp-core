import { Presentation } from "lucide-react";
import { isDemoBuild } from "@/lib/demo-build";

type Props = {
  className?: string;
};

export function EvaluationDemoBanner({ className = "" }: Props) {
  if (!isDemoBuild()) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand ${className}`}
      role="status"
      aria-live="polite"
    >
      <Presentation className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Evaluation / Demonstration Build</span>
    </div>
  );
}