export type ImportEntityType =
  | "customers"
  | "vendors"
  | "products"
  | "chart_of_accounts"
  | "beginning_inventory";

export type ImportRow = Record<string, string | number | boolean | null>;

export type FieldMapping = {
  sourceColumn: string;
  targetField: string;
};

export type ImportValidationIssue = {
  row: number;
  field?: string;
  message: string;
  severity: "error" | "warning";
};

export type ImportPreview = {
  entity: ImportEntityType;
  headers: string[];
  rows: ImportRow[];
  mapping: FieldMapping[];
  issues: ImportValidationIssue[];
  duplicateCount: number;
};

export type ImportHistoryEntry = {
  id: string;
  entity: ImportEntityType;
  fileName: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  at: string;
  status: "completed" | "partial" | "failed";
};
