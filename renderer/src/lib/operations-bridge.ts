/**
 * Unified IPC bridge for all operations domains (window.benben.operations.*).
 */
import type { Entity, EntityKind, ProductionBatch, StageStatus } from "./mock-data";
import { isOperationsBackend } from "./store-persist";

type IpcOk<T> = { ok: true; data: T };
type IpcErr = { ok: false; error: string };

function ops() {
  const api = window.benben?.operations;
  if (!api) throw new Error("Operations module requires the Benben desktop app.");
  return api;
}

function unwrap<T>(res: IpcOk<T> | IpcErr): T {
  if (!res.ok) throw new Error(res.error || "Request failed.");
  return res.data;
}

export { isOperationsBackend };

export type BomLine = {
  id: string;
  sku: string;
  material: string;
  qtyPerUnit: number;
  uom: string;
  unitCost: number;
};

export type BomVersion = {
  id: string;
  bomCode: string;
  name: string;
  version: string;
  productSku: string;
  effectiveFrom: string;
  lines: BomLine[];
  notes?: string;
};

export type MaterialUsage = {
  id: string;
  batchId: string;
  sku: string;
  qty: number;
  at: string;
};

export type LaborEntry = {
  id: string;
  batchId: string;
  stageId: string;
  hours: number;
  rate: number;
  at: string;
};

export type NewBatchInput = {
  product: string;
  client: string;
  units: number;
  cycleMonths: number;
  expectedCompletion: string;
};

export type ManufacturingState = {
  batches: ProductionBatch[];
  boms: BomVersion[];
  materialUsage: MaterialUsage[];
  labor: LaborEntry[];
};

export async function fetchManufacturingState(): Promise<ManufacturingState> {
  return unwrap(await ops().manufacturing.getState());
}

export async function createBatchRemote(input: NewBatchInput): Promise<ProductionBatch> {
  return unwrap(await ops().manufacturing.createBatch(input));
}

export async function updateBatchStatusRemote(
  batchId: string,
  status: ProductionBatch["status"],
): Promise<ProductionBatch> {
  return unwrap(await ops().manufacturing.updateBatchStatus(batchId, status));
}

export async function updateStageStatusRemote(
  batchId: string,
  stageId: string,
  status: StageStatus,
): Promise<ProductionBatch> {
  return unwrap(await ops().manufacturing.updateStageStatus(batchId, stageId, status));
}

export async function recordMaterialUsageRemote(
  batchId: string,
  sku: string,
  qty: number,
): Promise<MaterialUsage> {
  return unwrap(await ops().manufacturing.recordMaterialUsage(batchId, sku, qty));
}

export async function recordLaborRemote(
  batchId: string,
  stageId: string,
  hours: number,
  rate?: number,
): Promise<{ entry: LaborEntry; batch: ProductionBatch }> {
  return unwrap(await ops().manufacturing.recordLabor(batchId, stageId, hours, rate));
}

export async function saveBomRemote(bom: Omit<BomVersion, "id"> & { id?: string }): Promise<BomVersion> {
  return unwrap(await ops().manufacturing.saveBom(bom));
}

export async function createBomVersionRemote(
  productSku: string,
  lines: BomLine[],
  notes?: string,
  meta?: { bomCode?: string; name?: string },
): Promise<BomVersion> {
  return unwrap(await ops().manufacturing.createBomVersion(productSku, lines, notes, meta));
}

export type POStatus = "draft" | "pending_approval" | "approved" | "denied" | "received" | "closed";
export type POLogAction = "created" | "submitted" | "approved" | "denied" | "received";
export type POLine = { sku: string; description: string; qty: number; unitCost: number };
export type PurchaseOrder = {
  id: string;
  poNumber: string;
  vendorCode: string;
  vendorName: string;
  status: POStatus;
  lines: POLine[];
  warehouseId: string;
  expectedDelivery: string;
  taxAmount: number;
  shippingAmount: number;
  notes?: string;
  createdAt: string;
  approvedAt?: string;
  deniedAt?: string;
  denialReason?: string;
  requestedByUserId?: string;
  requestedByName?: string;
};
export type POLogEntry = {
  id: string;
  poId: string;
  action: POLogAction;
  fromStatus?: POStatus;
  toStatus?: POStatus;
  actorUserId?: string;
  actorName?: string;
  comment?: string;
  createdAt: string;
};
export type GoodsReceipt = { id: string; poId: string; receivedAt: string; qty: number; sku: string };
export type CreatePOInput = {
  poNumber?: string;
  vendorCode: string;
  vendorName: string;
  warehouseId: string;
  expectedDelivery: string;
  taxAmount: number;
  shippingAmount: number;
  notes?: string;
  status: POStatus;
  lines: POLine[];
  requestedByUserId?: string;
  requestedByName?: string;
};
export type PurchasingState = { orders: PurchaseOrder[]; receipts: GoodsReceipt[] };

export async function fetchPurchasingState(): Promise<PurchasingState> {
  return unwrap(await ops().purchasing.getState());
}
export async function createPurchaseOrderRemote(order: PurchaseOrder): Promise<PurchaseOrder> {
  return unwrap(await ops().purchasing.createOrder(order));
}
export async function approvePORemote(id: string): Promise<PurchaseOrder> {
  return unwrap(await ops().purchasing.approve(id));
}
export async function denyPORemote(id: string, reason: string): Promise<PurchaseOrder> {
  return unwrap(await ops().purchasing.deny(id, reason));
}
export async function submitPORemote(id: string): Promise<PurchaseOrder> {
  return unwrap(await ops().purchasing.submit(id));
}
export async function fetchPoLogRemote(poId: string): Promise<POLogEntry[]> {
  return unwrap(await ops().purchasing.getPoLog(poId));
}
export async function receivePORemote(
  id: string,
  sku: string,
  qty: number,
): Promise<{ receipt: GoodsReceipt; order: PurchaseOrder }> {
  return unwrap(await ops().purchasing.receive(id, sku, qty));
}

export type ImportLine = {
  id: string;
  sku: string;
  description: string;
  qty: number;
  unitValue: number;
};
export type ImportShipment = {
  id: string;
  reference: string;
  origin: string;
  destination: string;
  status: "booked" | "in_transit" | "customs" | "delivered";
  customsTariffPct: number;
  customsFees: number;
  freightCost: number;
  insuranceCost: number;
  landedCost: number;
  lines: ImportLine[];
  eta: string;
  landedCostApplied?: boolean;
  attachments: { id: string; name: string; size: number; at: string }[];
};

export async function fetchImportShipments(): Promise<ImportShipment[]> {
  return unwrap(await ops().imports.list());
}
export async function createShipmentRemote(shipment: ImportShipment): Promise<ImportShipment> {
  return unwrap(await ops().imports.create(shipment));
}
export async function updateShipmentRemote(
  id: string,
  patch: Partial<ImportShipment>,
): Promise<ImportShipment> {
  return unwrap(await ops().imports.update(id, patch));
}
export async function attachFileRemote(
  shipmentId: string,
  name: string,
  size: number,
): Promise<ImportShipment> {
  return unwrap(await ops().imports.attachFile(shipmentId, name, size));
}
export async function applyLandedCostRemote(shipmentId: string): Promise<ImportShipment | null> {
  return unwrap(await ops().imports.applyLandedCost(shipmentId));
}

export type CrmActivity = {
  id: string;
  entityId: string;
  type: "call" | "email" | "meeting" | "note";
  subject: string;
  body: string;
  at: string;
};
export type CrmReminder = {
  id: string;
  entityId: string;
  title: string;
  dueAt: string;
  completed: boolean;
};
export type EntityInput = {
  name: string;
  kind: EntityKind;
  country: string;
  contact: string;
  ytdValue?: number;
};
export type CrmState = { entities: Entity[]; activities: CrmActivity[]; reminders: CrmReminder[] };

export async function fetchCrmState(): Promise<CrmState> {
  return unwrap(await ops().crm.getState());
}
export async function importEntityRemote(input: {
  code: string;
  name: string;
  kind: EntityKind;
  contact?: string;
  country?: string;
}): Promise<Entity> {
  return unwrap(await ops().crm.importEntity(input));
}
export async function createEntityRemote(entity: Entity): Promise<Entity> {
  return unwrap(await ops().crm.createEntity(entity));
}
export async function updateEntityRemote(id: string, patch: Partial<EntityInput>): Promise<Entity> {
  return unwrap(await ops().crm.updateEntity(id, patch));
}
export async function addActivityRemote(
  entityId: string,
  type: CrmActivity["type"],
  subject: string,
  body: string,
): Promise<CrmActivity> {
  return unwrap(await ops().crm.addActivity(entityId, type, subject, body));
}
export async function addReminderRemote(
  entityId: string,
  title: string,
  dueAt: string,
): Promise<CrmReminder> {
  return unwrap(await ops().crm.addReminder(entityId, title, dueAt));
}
export async function completeReminderRemote(id: string): Promise<CrmReminder> {
  return unwrap(await ops().crm.completeReminder(id));
}

export type PipelineStage =
  | "lead"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";
export type Opportunity = {
  id: string;
  entityId: string;
  title: string;
  stage: PipelineStage;
  probability: number;
  expectedCloseDate: string;
  expectedRevenue: number;
  owner: string;
  createdAt: string;
  updatedAt: string;
};
export type CrmTask = {
  id: string;
  entityId: string;
  opportunityId?: string;
  title: string;
  dueAt: string;
  completed: boolean;
  type: "task" | "call" | "meeting" | "follow_up";
};
export type PipelineState = { opportunities: Opportunity[]; tasks: CrmTask[] };

export async function fetchPipelineState(): Promise<PipelineState> {
  return unwrap(await ops().pipeline.getState());
}
export async function createOpportunityRemote(opportunity: Opportunity): Promise<Opportunity> {
  return unwrap(await ops().pipeline.createOpportunity(opportunity));
}
export async function moveOpportunityStageRemote(id: string, stage: PipelineStage): Promise<Opportunity> {
  return unwrap(await ops().pipeline.moveStage(id, stage));
}
export async function createCrmTaskRemote(
  input: Omit<CrmTask, "id" | "completed">,
): Promise<CrmTask> {
  return unwrap(await ops().pipeline.createTask(input));
}
export async function completeCrmTaskRemote(id: string): Promise<CrmTask> {
  return unwrap(await ops().pipeline.completeTask(id));
}

export type SalesDocStatus = "draft" | "open" | "fulfilled" | "invoiced" | "cancelled";
export type SalesLine = { sku: string; description: string; qty: number; unitPrice: number };
export type SalesQuote = {
  id: string;
  quoteNumber: string;
  customerCode: string;
  customerName: string;
  lines: SalesLine[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  terms: string;
  status: SalesDocStatus;
  validUntil: string;
  createdAt: string;
};
export type SalesOrder = {
  id: string;
  orderNumber: string;
  quoteId?: string;
  customerCode: string;
  customerName: string;
  lines: SalesLine[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  terms: string;
  status: SalesDocStatus;
  createdAt: string;
};
export type SalesInvoice = {
  id: string;
  invoiceNumber: string;
  orderId?: string;
  customerCode: string;
  customerName: string;
  lines: SalesLine[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  terms: string;
  status: SalesDocStatus;
  issuedAt: string;
  dueAt: string;
  amountPaid: number;
  recurring?: boolean;
};
export type SalesState = { quotes: SalesQuote[]; orders: SalesOrder[]; invoices: SalesInvoice[] };

export async function fetchSalesState(): Promise<SalesState> {
  return unwrap(await ops().sales.getState());
}
export async function createQuoteRemote(quote: SalesQuote): Promise<SalesQuote> {
  return unwrap(await ops().sales.createQuote(quote));
}
export async function convertQuoteToOrderRemote(quoteId: string): Promise<SalesOrder | null> {
  return unwrap(await ops().sales.convertQuoteToOrder(quoteId));
}
export async function convertOrderToInvoiceRemote(orderId: string): Promise<SalesInvoice | null> {
  return unwrap(await ops().sales.convertOrderToInvoice(orderId));
}

export type CartLine = { sku: string; name: string; price: number; qty: number };
export type SaleStatus = "queued" | "synced";
export type PosSale = {
  id: string;
  ref: string;
  date: string;
  locationId: string;
  paymentMethod: "cash" | "ar" | "card";
  lines: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
  status: SaleStatus;
  reversed?: boolean;
  taxExempt?: boolean;
  customerCode?: string;
  customerName?: string;
};
export type PosState = { sales: PosSale[]; queue: string[] };

export type OnlineOrderStatus =
  | "pending"
  | "confirmed"
  | "ready"
  | "picked_up"
  | "delivered"
  | "cancelled";
export type OnlineOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  lines: CartLine[];
  fulfillment: "pickup" | "delivery";
  status: OnlineOrderStatus;
  locationId: string;
  total: number;
  placedAt: string;
};
export type PosReturn = {
  id: string;
  saleRef: string;
  lines: { sku: string; qty: number }[];
  reason: string;
  refundMethod: "cash" | "card" | "store_credit";
  restocked: boolean;
  at: string;
};
export type VoidAudit = {
  id: string;
  saleRef: string;
  reason: string;
  managerPin?: string;
  at: string;
};
export type PosOpsState = { onlineOrders: OnlineOrder[]; returns: PosReturn[]; voids: VoidAudit[] };

export async function fetchPosState(): Promise<PosState> {
  return unwrap(await ops().pos.getState());
}
export async function savePosSaleRemote(sale: PosSale): Promise<PosSale> {
  return unwrap(await ops().pos.saveSale(sale));
}
export async function reversePosSaleRemote(saleId: string): Promise<PosSale | null> {
  return unwrap(await ops().pos.reverseSale(saleId));
}
export async function flushPosQueueRemote(): Promise<{ count: number; sales: PosSale[] }> {
  return unwrap(await ops().pos.flushQueue());
}
export async function clearPosTransactionsRemote(): Promise<void> {
  unwrap(await ops().pos.clearTransactions());
}
export async function fetchPosOpsState(): Promise<PosOpsState> {
  return unwrap(await ops().pos.getOpsState());
}
export async function createOnlineOrderRemote(
  input: Omit<OnlineOrder, "id" | "orderNumber" | "placedAt" | "status">,
): Promise<OnlineOrder> {
  return unwrap(await ops().pos.createOnlineOrder(input));
}
export async function updateOnlineOrderStatusRemote(
  id: string,
  status: OnlineOrderStatus,
): Promise<OnlineOrder> {
  return unwrap(await ops().pos.updateOnlineOrderStatus(id, status));
}
export async function recordReturnRemote(
  saleRef: string,
  lines: { sku: string; qty: number }[],
  reason: string,
  refundMethod: PosReturn["refundMethod"],
  restocked: boolean,
): Promise<PosReturn> {
  return unwrap(await ops().pos.recordReturn(saleRef, lines, reason, refundMethod, restocked));
}
export async function recordVoidRemote(
  saleRef: string,
  reason: string,
  managerPin?: string,
): Promise<VoidAudit> {
  return unwrap(await ops().pos.recordVoid(saleRef, reason, managerPin));
}

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";
export type LoyaltyAccount = {
  id: string;
  customerCode: string;
  name: string;
  points: number;
  tier: LoyaltyTier;
  history: { id: string; type: "earn" | "redeem"; points: number; ref: string; at: string }[];
};

export async function fetchLoyaltyAccounts(): Promise<LoyaltyAccount[]> {
  return unwrap(await ops().loyalty.list());
}
export async function earnPointsRemote(
  customerCode: string,
  points: number,
  ref: string,
): Promise<LoyaltyAccount[]> {
  return unwrap(await ops().loyalty.earnPoints(customerCode, points, ref));
}
export async function redeemPointsRemote(
  customerCode: string,
  points: number,
  ref: string,
): Promise<{ ok: boolean; accounts: LoyaltyAccount[] }> {
  return unwrap(await ops().loyalty.redeemPoints(customerCode, points, ref));
}

export type BlindSpotSeverity = "low" | "medium" | "high";
export type BlindSpotCategory = "operational" | "delivery" | "quality" | "client";
export type BlindSpotEntry = {
  id: string;
  title: string;
  body: string;
  severity: BlindSpotSeverity;
  category: BlindSpotCategory;
  partyId?: string;
  customerCode?: string;
  sku?: string;
  videoFilePath?: string;
  voiceTranscript?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};
export type BlindSpotQuery = {
  entityId?: string;
  customerCode?: string;
  sku?: string;
  skus?: string[];
};

export async function createBlindSpotEntryRemote(entry: BlindSpotEntry): Promise<BlindSpotEntry> {
  return unwrap(await ops().blindspot.create(entry));
}
export async function updateBlindSpotEntryRemote(
  id: string,
  patch: Partial<Omit<BlindSpotEntry, "id" | "createdAt" | "updatedAt">>,
): Promise<BlindSpotEntry> {
  return unwrap(await ops().blindspot.update(id, patch));
}
export async function getBlindSpotsForEntityRemote(query: BlindSpotQuery = {}): Promise<BlindSpotEntry[]> {
  return unwrap(await ops().blindspot.getForEntity(query));
}
export async function deleteBlindSpotEntryRemote(id: string): Promise<void> {
  unwrap(await ops().blindspot.delete(id));
}
export async function uploadBlindSpotVideoRemote(
  entryId: string,
  sourcePath: string,
): Promise<string> {
  const data = unwrap(await ops().blindspot.uploadVideo(entryId, sourcePath)) as { videoFilePath: string };
  return data.videoFilePath;
}
