/** Payload exported by renderer/localstorage-export.ts and imported by main process. */

export const LOCALSTORAGE_MIGRATION_KEY = "localStorage_v1";

export type LocalStorageMigrationSnapshot = {
  exportedAt: string;
  isDemoMode: boolean;
  sourceChecksum: string;
  modules: LocalStorageMigrationModules;
};

export type LocalStorageMigrationModules = {
  inventory?: {
    items: InventoryItemRow[];
    movements: InventoryMovementRow[];
  };
  locations?: LocationRow[];
  manufacturing?: {
    batches: ProductionBatchRow[];
    boms: BomVersionRow[];
    materialUsage: MaterialUsageRow[];
    labor: LaborEntryRow[];
  };
  purchasing?: {
    orders: PurchaseOrderRow[];
    receipts: GoodsReceiptRow[];
  };
  sales?: {
    quotes: SalesQuoteRow[];
    orders: SalesOrderRow[];
    invoices: SalesInvoiceRow[];
  };
  crm?: {
    entities: CrmPartyRow[];
    activities: CrmActivityRow[];
    reminders: CrmReminderRow[];
  };
  crmPipeline?: {
    opportunities: CrmOpportunityRow[];
    tasks: CrmTaskRow[];
  };
  imports?: { shipments: ImportShipmentRow[] };
  pos?: { sales: PosSaleRow[]; queue: string[] };
  posOps?: {
    onlineOrders: PosOnlineOrderRow[];
    returns: PosReturnRow[];
    voids: PosVoidAuditRow[];
  };
  posLoyalty?: LoyaltyAccountRow[];
  dataImportHistory?: DataImportHistoryRow[];
  finance?: {
    ar?: ArStoreRow;
    ap?: ApStoreRow;
    gl?: GlStoreRow;
  };
};

export type InventoryItemRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  onHand: number;
  reorderLevel: number;
  unitCost: number;
  warehouse: string;
  location: string;
  barcode?: string;
  qrCode?: string;
  status: string;
};

export type InventoryMovementRow = {
  id: string;
  sku: string;
  type: string;
  qty: number;
  reason: string;
  at: string;
  warehouse: string;
};

export type LocationRow = {
  id: string;
  label: string;
  kind: string;
  taxState?: string;
  address?: string;
  phone?: string;
  warehouseId?: string;
  registers?: string[];
  managerName?: string;
  active: boolean;
};

export type BomLineRow = {
  id: string;
  sku: string;
  material: string;
  qtyPerUnit: number;
  uom: string;
  unitCost: number;
};

export type BomVersionRow = {
  id: string;
  bomCode: string;
  name: string;
  version: string;
  productSku: string;
  effectiveFrom: string;
  lines: BomLineRow[];
  notes?: string;
};

export type ProductionStageRow = {
  id: string;
  name: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  laborHours: number;
  machineHours: number;
  laborCost: number;
  machineCost: number;
  yieldPct: number;
  scrapUnits: number;
};

export type ProductionBatchRow = {
  id: string;
  code: string;
  product: string;
  client: string;
  units: number;
  startedAt: string;
  expectedCompletion: string;
  cycleMonths: number;
  stages: ProductionStageRow[];
  wipValue: number;
  status: string;
};

export type MaterialUsageRow = {
  id: string;
  batchId: string;
  sku: string;
  qty: number;
  at: string;
};

export type LaborEntryRow = {
  id: string;
  batchId: string;
  stageId: string;
  hours: number;
  rate: number;
  at: string;
};

export type PurchaseOrderRow = {
  id: string;
  poNumber: string;
  vendorCode: string;
  vendorName: string;
  status: string;
  lines: { sku: string; description: string; qty: number; unitCost: number }[];
  warehouseId: string;
  expectedDelivery: string;
  taxAmount: number;
  shippingAmount: number;
  notes?: string;
  createdAt: string;
  approvedAt?: string;
};

export type GoodsReceiptRow = {
  id: string;
  poId: string;
  receivedAt: string;
  qty: number;
  sku: string;
};

export type SalesLineRow = {
  sku: string;
  description: string;
  qty: number;
  unitPrice: number;
};

export type SalesQuoteRow = {
  id: string;
  quoteNumber: string;
  customerCode: string;
  customerName: string;
  lines: SalesLineRow[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  terms: string;
  status: string;
  validUntil: string;
  createdAt: string;
};

export type SalesOrderRow = {
  id: string;
  orderNumber: string;
  quoteId?: string;
  customerCode: string;
  customerName: string;
  lines: SalesLineRow[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  terms: string;
  status: string;
  createdAt: string;
};

export type SalesInvoiceRow = {
  id: string;
  invoiceNumber: string;
  orderId?: string;
  customerCode: string;
  customerName: string;
  lines: SalesLineRow[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  terms: string;
  status: string;
  issuedAt: string;
  dueAt: string;
  amountPaid: number;
  recurring?: boolean;
};

export type CrmPartyRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  country: string;
  contact: string;
  ytdValue: number;
  status: string;
};

export type CrmActivityRow = {
  id: string;
  entityId: string;
  type: string;
  subject: string;
  body: string;
  at: string;
};

export type CrmReminderRow = {
  id: string;
  entityId: string;
  title: string;
  dueAt: string;
  completed: boolean;
};

export type CrmOpportunityRow = {
  id: string;
  entityId: string;
  title: string;
  stage: string;
  probability: number;
  expectedCloseDate: string;
  expectedRevenue: number;
  owner: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmTaskRow = {
  id: string;
  entityId: string;
  opportunityId?: string;
  title: string;
  dueAt: string;
  completed: boolean;
  type: string;
};

export type ImportShipmentRow = {
  id: string;
  reference: string;
  origin: string;
  destination: string;
  status: string;
  customsTariffPct: number;
  customsFees: number;
  freightCost: number;
  insuranceCost: number;
  landedCost: number;
  lines: { id: string; sku: string; description: string; qty: number; unitValue: number }[];
  eta: string;
  landedCostApplied?: boolean;
  attachments: { id: string; name: string; size: number; at: string }[];
};

export type PosSaleRow = {
  id: string;
  ref: string;
  date: string;
  locationId: string;
  paymentMethod: string;
  lines: { sku: string; name: string; price: number; qty: number }[];
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  reversed?: boolean;
  taxExempt?: boolean;
};

export type PosOnlineOrderRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  lines: { sku: string; name: string; price: number; qty: number }[];
  fulfillment: string;
  status: string;
  locationId: string;
  total: number;
  placedAt: string;
};

export type PosReturnRow = {
  id: string;
  saleRef: string;
  lines: { sku: string; qty: number }[];
  reason: string;
  refundMethod: string;
  restocked: boolean;
  at: string;
};

export type PosVoidAuditRow = {
  id: string;
  saleRef: string;
  reason: string;
  managerPin?: string;
  at: string;
};

export type LoyaltyAccountRow = {
  id: string;
  customerCode: string;
  name: string;
  points: number;
  tier: string;
  history: { id: string; type: string; points: number; ref: string; at: string }[];
};

export type DataImportHistoryRow = {
  id: string;
  entity: string;
  fileName: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  at: string;
  status: string;
};

export type ArStoreRow = {
  invoices: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  creditMemos: Record<string, unknown>[];
  financeCharges: Record<string, unknown>[];
  collectionNotes: Record<string, unknown>[];
};

export type ApStoreRow = {
  bills: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  recurring: Record<string, unknown>[];
  credits: Record<string, unknown>[];
};

export type GlStoreRow = {
  accounts: { code: string; name: string; type: string; balance: number }[];
  journal: {
    id: string;
    date: string;
    ref: string;
    memo: string;
    source: string;
    lines: { account: string; debit: number; credit: number }[];
    posted: boolean;
  }[];
  audit: Record<string, unknown>[];
};

export type MigrationModuleCounts = Record<string, number>;

export type MigrationStatusDto = {
  migrationKey: string;
  required: boolean;
  completed: boolean;
  status: string | null;
  completedAt: string | null;
  moduleCounts: MigrationModuleCounts | null;
  errorDetail: string | null;
};

export type MigrationImportResult = {
  ok: boolean;
  skipped?: boolean;
  skipReason?: string;
  moduleCounts?: MigrationModuleCounts;
  error?: string;
};
