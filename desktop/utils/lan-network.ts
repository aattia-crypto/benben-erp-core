import os from "node:os";

/** Non-loopback IPv4 addresses on active adapters (for LAN URL logging). */
export function getLanIPv4Addresses(): string[] {
  const nets = os.networkInterfaces();
  const addrs: string[] = [];
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      const fam = net.family as string | number;
      if (fam !== "IPv4" && fam !== 4) continue;
      if (net.internal) continue;
      addrs.push(net.address);
    }
  }
  return [...new Set(addrs)];
}

export function formatLanServiceUrls(port: number, pathSuffix = ""): string[] {
  const suffix = pathSuffix.startsWith("/") ? pathSuffix : pathSuffix ? `/${pathSuffix}` : "";
  return getLanIPv4Addresses().map((ip) => `http://${ip}:${port}${suffix}`);
}
