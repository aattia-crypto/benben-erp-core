import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy route — redirects to the data import wizard. */
export const Route = createFileRoute("/import")({
  beforeLoad: () => {
    throw redirect({ to: "/data-import" });
  },
});
