import net from "node:net";

/** Default LAN UI HTTP port (see lan-ui-server.ts). */
export const DEFAULT_LAN_UI_PORT = 8080;

/**
 * Attempt a bind on the requested host/port — returns true when the port is free.
 * Used during onboarding to validate LAN Mode can listen on TCP 8080.
 */
export async function verifyNetworkPortAvailability(
  port: number = DEFAULT_LAN_UI_PORT,
  host = "0.0.0.0",
): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen({ port, host, exclusive: true });
  });
}

/** User-facing guidance when {@link verifyNetworkPortAvailability} returns false. */
export function lanPortUnavailableMessage(port: number): string {
  return (
    `Port ${port} is already in use or blocked by a firewall. ` +
    `Close other applications using port ${port}, or allow Benben ERP through Windows Firewall, then try again.`
  );
}
