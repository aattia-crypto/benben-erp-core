import { useEffect, useState, type ReactNode } from "react";
import { PageHeader, Panel } from "@/components/ui-bits";
import { financeHealthCheck } from "@/lib/finance-api-client";
import { isDesktopShell } from "@/lib/desktop-api";

type Props = {
  title: string;
  subtitle: string;
  children?: ReactNode;
};

export function FinanceModuleShell({ title, subtitle, children }: Props) {
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    void financeHealthCheck().then(setApiOk);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      {!isDesktopShell() ? (
        <Panel title="Desktop required">
          <p className="text-sm text-muted-foreground">
            {title} persists to the local PostgreSQL database via the Finance API in the Benben desktop app.
          </p>
        </Panel>
      ) : apiOk === false ? (
        <Panel title="Finance API offline">
          <p className="text-sm text-muted-foreground">
            Restart the desktop app after running <code className="text-xs">npm run build</code> from the project
            folder. Check Settings → Desktop system health.
          </p>
        </Panel>
      ) : null}
      {children}
    </div>
  );
}
