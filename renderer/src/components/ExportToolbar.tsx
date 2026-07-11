import { ExportMenu } from "@/components/ExportMenu";
import type { ExportColumn, ExportMeta } from "@/lib/export-service";

type Props = {
  filenameBase: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  meta?: ExportMeta;
  className?: string;
};

/** @deprecated Use ExportMenu — kept for existing imports. */
export function ExportToolbar(props: Props) {
  return <ExportMenu {...props} />;
}
