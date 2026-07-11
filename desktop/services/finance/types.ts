export const ORG_DEFAULT = "default";

export type MatchStatus =
  | "UNMATCHED"
  | "PARTIALLY_MATCHED"
  | "MATCHED"
  | "RECONCILED";

export type DepreciationMethod = "STRAIGHT_LINE" | "DOUBLE_DECLINING";

export type BudgetCheckMode = "HARD_BLOCK" | "WARN_ONLY";

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
  currency?: string;
  amountFx?: number;
  fxRate?: number;
  costCenterId?: string;
}

export interface PostJournalInput {
  entryDate: Date;
  reference?: string;
  memo?: string;
  source: string;
  currency?: string;
  lines: JournalLineInput[];
}

export interface BankTxnUpload {
  txnDate: string;
  amount: number;
  reference?: string;
  checkNumber?: string;
  description?: string;
}

export interface BankStatementUploadInput {
  bankAccountCode: string;
  statementDate: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalance: number;
  closingBalance: number;
  currency?: string;
  fileName?: string;
  transactions: BankTxnUpload[];
}

export interface AutoMatchInput {
  bankStatementId: string;
  dateToleranceDays?: number;
  amountTolerance?: number;
}

export interface ManualMatchInput {
  bankTransactionId: string;
  journalLineIds: string[];
  matchedBy?: string;
  notes?: string;
}

export interface TaxLineInput {
  lineId: string;
  amount: number;
  taxCategory?: string;
  description?: string;
}

export interface TaxCalculateInput {
  originAddress?: string;
  destinationAddress?: string;
  taxZoneCode?: string;
  lines: TaxLineInput[];
  persistSnapshot?: boolean;
  invoiceRef?: string;
}

export interface BudgetValidateInput {
  costCenterCode: string;
  accountCode: string;
  amount: number;
  periodYear: number;
  periodMonth: number;
  mode?: BudgetCheckMode;
}
