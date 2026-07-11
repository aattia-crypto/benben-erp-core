import { Component, type ErrorInfo, type ReactNode } from "react";
import { logClientError } from "@/lib/error-log";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info);
    logClientError("react-boundary", error.message, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Benben hit an unexpected error. Your data is still on this device. Try reloading the page or
              restarting the app.
            </p>
            <p className="mt-3 rounded-md bg-surface px-3 py-2 font-mono text-xs text-destructive">
              {this.state.error.message}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                onClick={() => this.setState({ error: null })}
              >
                Try again
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2 text-sm"
                onClick={() => window.location.reload()}
              >
                Reload app
              </button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              If this persists, open Settings → Release & diagnostics and restore from a production backup.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
