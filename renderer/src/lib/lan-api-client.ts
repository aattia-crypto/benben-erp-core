import { getLanApiBase } from "./lan-mode";

const TOKEN_KEY = "benben.lan_token.v1";

export function getLanToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setLanToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function lanApiFetch<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const useAuth = init?.auth !== false;
  const token = getLanToken();
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getLanApiBase()}${path}`, {
    ...init,
    headers,
    signal: init?.signal ?? AbortSignal.timeout(12_000),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? `API ${res.status}`);
  }
  return json;
}
