import { QueryClient } from "@tanstack/react-query";
import { createHashHistory } from "@tanstack/history";
import { createRouter } from "@tanstack/react-router";
import "./lib/install-polyfills";
import { routeTree } from "./routeTree.gen";
import { isLanMode } from "./lib/lan-mode";

/** file:// and LAN static hosting use hash routes; browser history breaks staged SPA bootstrap. */
function createAppHistory() {
  if (typeof window === "undefined") return undefined;
  if (window.location.protocol === "file:" || isLanMode()) {
    return createHashHistory();
  }
  return undefined;
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createAppHistory(),
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Packaged Electron can hydrate before route tree registration; force once if needed.
  if (!router.routesById?.__root__) {
    router.update({ routeTree });
  }

  return router;
};
