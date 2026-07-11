/** Read the first defined environment variable (supports legacy NEXUSCORE_* names). */
export function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}
