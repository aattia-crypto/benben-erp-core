import { accounts as seedAccounts, journal as seedJournal, type Account, type JournalEntry, type JournalLine } from "./mock-data";
import { isDemoMode } from "./demo-mode";
import { readStorage, subscribeStorage, uid, writeStorage } from "./storage";
import { publishErpChange } from "./erp-sync";

export type DraftJournalLine = JournalLine;

export type AuditEvent = {
  id: string;
  at: string;
  action: string;
  ref: string;
  user?: string;
};

const KEY = "benben.gl.v1";

type Store = {
  accounts: Account[];
  journal: JournalEntry[];
  audit: AuditEvent[];
};

function emptyStore(): Store {
  return { accounts: [], journal: [], audit: [] };
}

function load(): Store {
  if (!isDemoMode()) {
    return readStorage(KEY, emptyStore());
  }
  const stored = readStorage<Store | null>(KEY, null);
  if (stored?.accounts?.length) return stored;
  const initial: Store = { accounts: [...seedAccounts], journal: [...seedJournal], audit: [] };
  writeStorage(KEY, initial);
  return initial;
}

let cache = load();

export function resetGlStore(): void {
  cache = emptyStore();
  writeStorage(KEY, cache);
}

function save(next: Store) {
  cache = next;
  writeStorage(KEY, next);
}

export function subscribeGl(fn: () => void) {
  return subscribeStorage(KEY, fn);
}

export function getAccounts(): Account[] {
  return cache.accounts;
}

export function importAccount(input: { code: string; name: string; type: Account["type"] }): Account {
  const code = input.code.trim();
  if (cache.accounts.some((a) => a.code === code)) {
    throw new Error(`Duplicate account ${code}`);
  }
  const account: Account = {
    code,
    name: input.name.trim(),
    type: input.type,
    balance: 0,
  };
  save({ ...cache, accounts: [...cache.accounts, account] });
  return account;
}

export function getJournal(): JournalEntry[] {
  return cache.journal;
}

export function getAudit(): AuditEvent[] {
  return cache.audit;
}

export function trialBalance(): { code: string; name: string; debit: number; credit: number }[] {
  const map = new Map<string, { debit: number; credit: number }>();
  for (const j of cache.journal) {
    for (const l of j.lines) {
      const cur = map.get(l.account) ?? { debit: 0, credit: 0 };
      cur.debit += l.debit;
      cur.credit += l.credit;
      map.set(l.account, cur);
    }
  }
  return cache.accounts.map((a) => {
    const bal = map.get(a.code) ?? { debit: 0, credit: 0 };
    return { code: a.code, name: a.name, ...bal };
  });
}

function logAudit(action: string, ref: string) {
  const evt: AuditEvent = { id: uid("aud"), at: new Date().toISOString(), action, ref };
  cache = { ...cache, audit: [evt, ...cache.audit] };
}

export function validateLines(lines: DraftJournalLine[]): { ok: true } | { ok: false; error: string } {
  if (lines.length < 2) return { ok: false, error: "At least two lines required." };
  const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(debit - credit) > 0.01) return { ok: false, error: `Entry out of balance (debits ${debit}, credits ${credit}).` };
  if (debit <= 0) return { ok: false, error: "Total debits must be greater than zero." };
  for (const l of lines) {
    if (!cache.accounts.some((a) => a.code === l.account)) return { ok: false, error: `Unknown account ${l.account}.` };
    if (l.debit && l.credit) return { ok: false, error: "Each line must be debit OR credit." };
  }
  return { ok: true };
}

export function postJournal(memo: string, lines: DraftJournalLine[], source: JournalEntry["source"] = "manual"): JournalEntry {
  const v = validateLines(lines);
  if (!v.ok) throw new Error(v.error);
  const entry: JournalEntry = {
    id: uid("je"),
    date: new Date().toISOString().slice(0, 10),
    ref: `JE-${String(cache.journal.length + 1).padStart(5, "0")}`,
    memo: memo.trim(),
    source,
    lines,
    posted: true,
  };
  const accounts = cache.accounts.map((a) => {
    const net = lines
      .filter((l) => l.account === a.code)
      .reduce((s, l) => s + l.debit - l.credit, 0);
    if (!net) return a;
    return { ...a, balance: a.balance + net };
  });
  logAudit("post", entry.ref);
  save({ ...cache, journal: [entry, ...cache.journal], accounts });
  publishErpChange("gl", "posted", entry.id);
  publishErpChange("dashboard", "gl-updated");
  return entry;
}

export function reverseJournal(entryId: string): JournalEntry {
  const original = cache.journal.find((j) => j.id === entryId);
  if (!original) throw new Error("Journal entry not found.");
  const lines = original.lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit }));
  const entry = postJournal(`Reversal of ${original.ref}: ${original.memo}`, lines, "manual");
  logAudit("reverse", original.ref);
  return entry;
}

export type InvoiceExtract = {
  vendor?: string;
  invoiceNumber?: string;
  date?: string;
  total?: number;
  lines?: { description: string; amount: number }[];
};

/** Lightweight invoice text extraction (OCR-ready hook — parses pasted/uploaded text). */
export function extractInvoiceFromText(text: string): InvoiceExtract {
  const totalMatch = text.match(/(?:total|amount due)[:\s]*\$?([\d,]+\.?\d*)/i);
  const invMatch = text.match(/(?:invoice|inv)[#:\s]*([A-Z0-9-]+)/i);
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
  const vendorLine = text.split("\n").find((l) => l.trim().length > 3 && !/invoice|total|date/i.test(l));
  return {
    vendor: vendorLine?.trim().slice(0, 80),
    invoiceNumber: invMatch?.[1],
    date: dateMatch?.[1],
    total: totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : undefined,
  };
}
