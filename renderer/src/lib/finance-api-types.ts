export type ApiGlAccount = {
  code: string;
  name: string;
  type: string;
  balance: number;
  currency?: string;
};

export type ApiJournalLine = {
  id: string;
  accountCode: string;
  description: string | null;
  debit: number;
  credit: number;
};

export type ApiJournalEntry = {
  id: string;
  entryDate: string;
  reference: string | null;
  memo: string | null;
  source: string;
  status: string;
  lines: ApiJournalLine[];
};

export type FinanceDashboard = {
  generatedAt: string;
  cashBalance: number;
  recentEntries: ApiJournalEntry[];
  bankReconciliation: { unmatched: number; partial: number };
  depreciationRuns: unknown[];
  consolidationRuns: unknown[];
  taxSummary: unknown;
  budgetVariance: { overCount: number; warnCount: number; rows: unknown[] } | null;
};

export type RevRecMilestoneRow = {
  id: string;
  scheduleId: string;
  milestoneName: string;
  percentage: number;
  amount: number;
  isTriggered: boolean;
  triggeredAt: string | null;
};

export type RevRecScheduleRow = {
  id: string;
  invoiceId: string | null;
  totalAmount: number;
  recognizedAmount: number;
  deferredAmount: number;
  status: string;
  milestones: RevRecMilestoneRow[];
};

export type RevRecWipDashboard = {
  schedules: RevRecScheduleRow[];
  summary: {
    scheduleCount: number;
    scheduleDeferred: number;
    scheduleRecognized: number;
    deferredLedgerBalance: number;
    activeSchedules: number;
  };
};

export type WipLedgerDashboard = {
  wipLedgerBalance: number;
  operationalWipValue: number;
  activeBatchCount: number;
  recentCapitalizations: ApiJournalEntry[];
};
