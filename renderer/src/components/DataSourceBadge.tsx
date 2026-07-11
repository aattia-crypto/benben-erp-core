import { Pill } from "@/components/ui-bits";

export function DataSourceBadge({ source }: { source: string }) {
  const isDb = source === "database";
  return (
    <Pill tone={isDb ? "success" : "brand"}>
      Source: {isDb ? "database" : "demo cache"}
    </Pill>
  );
}
