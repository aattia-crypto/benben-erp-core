/**
 * Transition layer: local PostgreSQL finance API (desktop) with localStorage gl-store fallback.
 * Preserves gl-store.ts for integrations; UI should prefer this module for reads/writes.
 */
import type { Account, JournalEntry, JournalLine } from "./mock-data";
import { financeApi, financeHealthCheck } from "./finance-api-client";
import type { ApiGlAccount, ApiJournalEntry } from "./finance-api-types";
import {
  getAccounts as getLocalAccounts,
  getJournal as getLocalJournal,
  postJournal as postLocalJournal,
  reverseJournal as reverseLocalJournal,
  trialBalance as localTrialBalance,
  type DraftJournalLine,
} from "./gl-store";
import { isDesktopShell } from "./desktop-api";
import { publishErpChange } from "./erp-sync";

export type GlDataSource = "database" | "localStorage" | "merged";

let lastSource: GlDataSource = "localStorage";
let apiAvailable: boolean | null = null;

export function getLastGlDataSource(): GlDataSource {
  return lastSource;
}

async function checkApi(): Promise<boolean> {
  if (!isDesktopShell()) {
    apiAvailable = false;
    return false;
  }
  if (apiAvailable === null) {
    apiAvailable = await financeHealthCheck();
  }
  return apiAvailable;
}

function mapAccountType(t: string): Account["type"] {
  const lower = t.toLowerCase();
  if (lower === "asset" || lower === "liability" || lower === "equity" || lower === "revenue" || lower === "expense") {
    return lower;
  }
  return "expense";
}

function apiAccountToLocal(a: ApiGlAccount): Account {
  return {
    code: a.code,
    name: a.name,
    type: mapAccountType(a.type),
    balance: a.balance,
  };
}

function apiEntryToLocal(e: ApiJournalEntry, index: number): JournalEntry {
  const lines: JournalLine[] = e.lines.map((l) => ({
    account: l.accountCode,
    debit: l.debit,
    credit: l.credit,
  }));
  return {
    id: e.id,
    date: e.entryDate.slice(0, 10),
    ref: e.reference ?? `JE-DB-${index + 1}`,
    memo: e.memo ?? "",
    source: mapSource(e.source),
    lines,
    posted: true,
  };
}

function mapSource(source: string): JournalEntry["source"] {
  const s = source.toLowerCase();
  if (s === "sales" || s === "pos") return "sales";
  if (s === "production") return "production";
  if (s === "ap") return "ap";
  if (s === "payroll") return "payroll";
  return "manual";
}

export async function fetchAccountsBridge(): Promise<{ accounts: Account[]; source: GlDataSource }> {
  if (await checkApi()) {
    try {
      const { accounts } = await financeApi.glAccounts();
      lastSource = "database";
      return { accounts: accounts.map(apiAccountToLocal), source: "database" };
    } catch {
      apiAvailable = false;
    }
  }
  lastSource = "localStorage";
  return { accounts: getLocalAccounts(), source: "localStorage" };
}

export async function fetchJournalBridge(): Promise<{ journal: JournalEntry[]; source: GlDataSource }> {
  if (await checkApi()) {
    try {
      const { entries } = await financeApi.glEntries({ limit: "300" });
      lastSource = "database";
      return {
        journal: entries.map((e, i) => apiEntryToLocal(e, i)),
        source: "database",
      };
    } catch {
      apiAvailable = false;
    }
  }
  lastSource = "localStorage";
  return { journal: getLocalJournal(), source: "localStorage" };
}

export async function fetchTrialBalanceBridge(): Promise<{
  rows: { code: string; name: string; debit: number; credit: number }[];
  source: GlDataSource;
}> {
  if (await checkApi()) {
    try {
      const { rows } = await financeApi.glTrialBalance();
      lastSource = "database";
      return {
        rows: rows.map((r) => ({ code: r.code, name: r.name, debit: r.debit, credit: r.credit })),
        source: "database",
      };
    } catch {
      apiAvailable = false;
    }
  }
  lastSource = "localStorage";
  return { rows: localTrialBalance(), source: "localStorage" };
}

export type PostJournalOptions = {
  module?: string;
  reference?: string;
  idempotencyKey?: string;
};

export async function postJournalBridge(
  memo: string,
  lines: DraftJournalLine[],
  source: JournalEntry["source"] = "manual",
  options?: PostJournalOptions,
): Promise<{ entry: JournalEntry; source: GlDataSource; duplicate?: boolean }> {
  if (await checkApi()) {
    try {
      const apiLines = lines.map((l) => ({
        accountCode: l.account,
        debit: l.debit || 0,
        credit: l.credit || 0,
      }));
      const created = await financeApi.postGlEntry({
        memo,
        source: source.toUpperCase(),
        lines: apiLines,
        module: options?.module ?? "gl",
        reference: options?.reference,
        idempotencyKey: options?.idempotencyKey,
      } as never);
      const entry = apiEntryToLocal(created, 0);
      lastSource = "database";
      publishErpChange("gl", "posted", entry.id);
      publishErpChange("dashboard", "gl-updated");
      return { entry, source: "database" };
    } catch {
      apiAvailable = false;
    }
  }
  const entry = postLocalJournal(memo, lines, source);
  lastSource = "localStorage";
  return { entry, source: "localStorage" };
}

export async function reverseJournalBridge(entryId: string): Promise<JournalEntry> {
  if (await checkApi()) {
    try {
      const created = await financeApi.reverseGlEntry(entryId);
      return apiEntryToLocal(created, 0);
    } catch {
      apiAvailable = false;
    }
  }
  return reverseLocalJournal(entryId);
}

/** Dual-write helper for erp-integrations still calling gl-store.postJournal */
export async function syncLocalJournalToDatabase(
  memo: string,
  lines: DraftJournalLine[],
  source: JournalEntry["source"],
): Promise<void> {
  if (!(await checkApi())) return;
  try {
    await financeApi.postGlEntry({
      memo,
      source: source.toUpperCase(),
      lines: lines.map((l) => ({
        accountCode: l.account,
        debit: l.debit || 0,
        credit: l.credit || 0,
      })),
    });
  } catch {
    apiAvailable = false;
  }
}

export function invalidateFinanceApiCache(): void {
  apiAvailable = null;
}
