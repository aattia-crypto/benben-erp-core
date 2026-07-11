/**
 * Presenter Mode frontend fixtures (demo-operational-seed-v3).
 * Used when DB/IPC is unavailable or returns empty — only when isDemoBuild().
 */
import type { Entity, ProductionBatch, ProductionStage } from "./mock-data";
import type { InventoryItem, InventoryMovement } from "./inventory-store";
import type { StockLocation } from "./location-store";
import type {
  BomVersion,
  CrmActivity,
  CrmReminder,
  GoodsReceipt,
  LaborEntry,
  MaterialUsage,
  PurchaseOrder,
} from "./operations-bridge";
import type { EmployeeDto } from "./hr-bridge";
import type { ApBill } from "./ap-store";
import type { VendorLedgerPayment, VendorLedgerResult } from "./ap-bridge";
import { isDemoBuild } from "./demo-build";

const DEMO_SEED_MARKER = "demo-operational-seed-v3";
const STAGE_NAMES = [
  "Substrate Prep",
  "Photolithography",
  "Etch & Deposition",
  "Doping",
  "Metallization",
  "Test & Burn-In",
  "Final QA / Packaging",
] as const;

function dateOnly(daysOffset = 0): string {
  const value = new Date();
  value.setDate(value.getDate() + daysOffset);
  return value.toISOString().slice(0, 10);
}

function isoAt(daysOffset = 0): string {
  return `${dateOnly(daysOffset)}T12:00:00.000Z`;
}

/** True when Presenter Mode may inject fixture data. */
export function shouldUseDemoFallback(): boolean {
  return isDemoBuild();
}

export const DEMO_WAREHOUSE_HUBS: StockLocation[] = [
  {
    id: "loc_wh_central",
    label: "Central Distribution Hub",
    kind: "warehouse",
    address: "500 Logistics Pkwy, Metro City",
    managerName: "Regional Operations",
    active: true,
    registers: [],
  },
  {
    id: "loc_wh_west",
    label: "West Coast Regional Hub",
    kind: "warehouse",
    address: "800 Maritime St, Oakland CA",
    managerName: "Regional Operations",
    active: true,
    registers: [],
  },
  {
    id: "loc_wh_east",
    label: "East Coast Regional Hub",
    kind: "warehouse",
    address: "12 Port Way, Newark NJ",
    managerName: "Regional Operations",
    active: true,
    registers: [],
  },
  {
    id: "loc_wh_south",
    label: "Southern Regional Hub",
    kind: "warehouse",
    address: "4100 Commerce Dr, Dallas TX",
    managerName: "Regional Operations",
    active: true,
    registers: [],
  },
  {
    id: "loc_wh_midwest",
    label: "Midwest Regional Hub",
    kind: "warehouse",
    address: "2200 Rail Yard Rd, Chicago IL",
    managerName: "Regional Operations",
    active: true,
    registers: [],
  },
  {
    id: "loc_wh_export",
    label: "Export Bonded Hub",
    kind: "warehouse",
    address: "700 Harbor Blvd, Long Beach CA",
    managerName: "Regional Operations",
    active: true,
    registers: [],
  },
];

const DEMO_STORES: StockLocation[] = [
  {
    id: "loc_store_downtown",
    label: "Downtown Showroom",
    kind: "store",
    address: "120 Market St, Metro City",
    warehouseId: "loc_wh_central",
    registers: ["Register 1", "Register 2"],
    managerName: "Retail Lead",
    active: true,
  },
  {
    id: "loc_store_west",
    label: "Bay Area Store",
    kind: "store",
    address: "56 Embarcadero, Oakland CA",
    warehouseId: "loc_wh_west",
    registers: ["Register 1", "Register 2"],
    managerName: "Retail Lead",
    active: true,
  },
  {
    id: "loc_store_north",
    label: "Northside Retail",
    kind: "store",
    address: "8800 North Ave, Chicago IL",
    warehouseId: "loc_wh_midwest",
    registers: ["Register 1", "Register 2"],
    managerName: "Retail Lead",
    active: true,
  },
  {
    id: "loc_store_south",
    label: "South Campus Outlet",
    kind: "store",
    address: "45 Innovation Dr, Dallas TX",
    warehouseId: "loc_wh_south",
    registers: ["Register 1", "Register 2"],
    managerName: "Retail Lead",
    active: true,
  },
];

export const DEMO_LOCATIONS: StockLocation[] = [...DEMO_WAREHOUSE_HUBS, ...DEMO_STORES];

export function getDemoWarehouseOptions(): StockLocation[] {
  return DEMO_WAREHOUSE_HUBS.map((h) => ({ ...h }));
}

export const DEMO_CRM_PARTIES: Entity[] = [
  {
    id: "e_demo_c1042",
    code: "C-1042",
    name: "Helion Aerospace",
    kind: "client",
    country: "USA",
    contact: "procurement@helion.aero",
    address: "410 Orbital Way, Seattle WA",
    phone: "+1 206-555-1042",
    taxId: "91-4820014",
    paymentTerms: "Net 30",
    ytdValue: 4_820_000,
    status: "active",
  },
  {
    id: "e_demo_c1040",
    code: "C-1040",
    name: "Atlas Defense Systems",
    kind: "client",
    country: "USA",
    contact: "ops@atlasdef.com",
    address: "200 Arsenal Blvd, Arlington VA",
    phone: "+1 703-555-1040",
    taxId: "54-3200001",
    paymentTerms: "Net 30",
    ytdValue: 3_200_000,
    status: "active",
  },
  {
    id: "e_demo_c1043",
    code: "C-1043",
    name: "Northwind Semis",
    kind: "client",
    country: "USA",
    contact: "buyers@northwind.io",
    address: "17 Foundry Park, Austin TX",
    phone: "+1 512-555-1043",
    taxId: "74-2140003",
    paymentTerms: "Net 30",
    ytdValue: 2_140_000,
    status: "active",
  },
  {
    id: "e_demo_c1044",
    code: "C-1044",
    name: "Tessera Robotics",
    kind: "client",
    country: "JPN",
    contact: "supply@tessera.jp",
    address: "4-2 Shibaura, Tokyo",
    phone: "+81 3-5555-1044",
    taxId: "JP-1044",
    paymentTerms: "Net 30",
    ytdValue: 1_360_500,
    status: "active",
  },
  {
    id: "e_demo_c1045",
    code: "C-1045",
    name: "Veridian Health",
    kind: "client",
    country: "USA",
    contact: "procurement@veridian.health",
    address: "800 Wellness Ave, Boston MA",
    phone: "+1 617-555-1045",
    taxId: "04-5501045",
    paymentTerms: "Net 30",
    ytdValue: 890_000,
    status: "active",
  },
  {
    id: "e_demo_c3001",
    code: "C-3001",
    name: "Northstar Retail Group",
    kind: "client",
    country: "USA",
    contact: "buying@northstarretail.com",
    address: "35 Market Square, Denver CO",
    phone: "+1 303-555-3001",
    taxId: "84-3013001",
    paymentTerms: "Net 30",
    ytdValue: 625_000,
    status: "active",
  },
  {
    id: "e_demo_v2210",
    code: "V-2210",
    name: "Wafertek Materials",
    kind: "vendor",
    country: "TWN",
    contact: "sales@wafertek.tw",
    address: "88 Hsinchu Science Park, Taiwan",
    phone: "+886 3-555-2210",
    taxId: "TW-2210",
    paymentTerms: "Net 30",
    ytdValue: 980_000,
    status: "active",
  },
  {
    id: "e_demo_v2211",
    code: "V-2211",
    name: "Lumen Optics GmbH",
    kind: "vendor",
    country: "DEU",
    contact: "orders@lumen.de",
    address: "9 Optikstrasse, Munich",
    phone: "+49 89-555-2211",
    taxId: "DE-2211",
    paymentTerms: "Net 30",
    ytdValue: 612_300,
    status: "active",
  },
  {
    id: "e_demo_v2212",
    code: "V-2212",
    name: "PrecisionPCB Co.",
    kind: "vendor",
    country: "KOR",
    contact: "ap@precisionpcb.kr",
    address: "45 Tech Valley, Seoul",
    phone: "+82 2-555-2212",
    taxId: "KR-2212",
    paymentTerms: "Net 30",
    ytdValue: 240_900,
    status: "active",
  },
  {
    id: "e_demo_v3301",
    code: "V-3301",
    name: "Coastal Freight",
    kind: "vendor",
    country: "USA",
    contact: "dispatch@coastalfreight.com",
    address: "1 Harbor Way, Long Beach CA",
    phone: "+1 562-555-3301",
    taxId: "95-3301001",
    paymentTerms: "Net 30",
    ytdValue: 310_000,
    status: "active",
  },
  {
    id: "e_demo_v4400",
    code: "V-4400",
    name: "Summit Chemicals",
    kind: "vendor",
    country: "USA",
    contact: "orders@summitchem.demo",
    address: "700 Chemical Row, Houston TX",
    phone: "+1 713-555-4400",
    taxId: "76-4400001",
    paymentTerms: "Net 30",
    ytdValue: 185_000,
    status: "active",
  },
];

export const DEMO_CRM_ACTIVITIES: CrmActivity[] = [
  {
    id: "crm_act_helion",
    entityId: "e_demo_c1042",
    type: "call",
    subject: "2026 production forecast",
    body: "Confirmed Helion Q3 demand and qualification requirements.",
    at: isoAt(0),
  },
  {
    id: "crm_act_atlas",
    entityId: "e_demo_c1040",
    type: "email",
    subject: "Atlas program quote",
    body: "Sent revised milestone pricing.",
    at: isoAt(0),
  },
  {
    id: "crm_act_northwind",
    entityId: "e_demo_c1043",
    type: "note",
    subject: "Qualification roadmap",
    body: "Northwind is evaluating SF-Q9 for its next-generation fabrication line.",
    at: isoAt(0),
  },
];

export const DEMO_CRM_REMINDERS: CrmReminder[] = [
  {
    id: "crm_rem_helion",
    entityId: "e_demo_c1042",
    title: "Executive account review",
    dueAt: dateOnly(7),
    completed: false,
  },
  {
    id: "crm_rem_veridian",
    entityId: "e_demo_c1045",
    title: "Follow up on pilot delivery",
    dueAt: dateOnly(12),
    completed: false,
  },
];

const ITEM_SPECS = [
  ["SF-A7", "SF-A7 Wafer Lot", "WIP / Finished", "lot", 3840, 20, 36],
  ["SF-X3", "SF-X3 Module", "WIP / Finished", "ea", 20080, 10, 18],
  ["SF-Q9", "SF-Q9 Sensor Array", "WIP / Finished", "ea", 46.67, 200, 420],
  ["RAW-SIL-100", "Silicon Wafer 100mm", "Raw Materials", "ea", 42.5, 200, 480],
  ["RAW-COP-50", "Copper Foil Roll 50m", "Raw Materials", "roll", 18.75, 80, 220],
  ["RAW-RES-01", "Photoresist Compound", "Raw Materials", "L", 95, 40, 96],
  ["PKG-BOX-A", "Anti-Static Packaging Box A", "Packaging", "ea", 2.4, 500, 1200],
  ["PKG-FOAM-02", "Protective Foam Insert", "Packaging", "ea", 0.85, 800, 2400],
  ["TOOL-PROBE-X", "Precision Test Probe Kit", "Tools", "kit", 310, 10, 7],
  ["FG-PWR-CTRL", "Power Controller Board", "Finished Goods", "ea", 185, 40, 88],
  ["MRO-GLOVE-N", "Cleanroom Nitrile Gloves (M)", "MRO", "box", 14.5, 30, 96],
  ["SPARE-FAN-120", "120mm Cooling Fan Assembly", "Spare Parts", "ea", 22, 25, 12],
] as const;

export const DEMO_INVENTORY_ITEMS: InventoryItem[] = ITEM_SPECS.map(
  ([sku, name, category, uom, unitCost, reorderLevel, onHand], index) => ({
    id: `inv_demo_${index}`,
    sku,
    name,
    category,
    uom,
    unitCost,
    reorderLevel,
    onHand,
    warehouse: DEMO_WAREHOUSE_HUBS[index % DEMO_WAREHOUSE_HUBS.length].label,
    location: `A-${String(index + 1).padStart(2, "0")}`,
    barcode: `BB${sku.replaceAll("-", "")}`,
    status: "active" as const,
  }),
);

export const DEMO_INVENTORY_MOVEMENTS: InventoryMovement[] = ITEM_SPECS.flatMap(
  ([sku, , , , , , onHand], index) => {
    const warehouse = DEMO_WAREHOUSE_HUBS[index % DEMO_WAREHOUSE_HUBS.length].label;
    return (
      [
        ["receive", onHand + 20, -45],
        ["issue", -12, -18],
        ["adjust", -8, -3],
      ] as const
    ).map(([type, qty, days]) => ({
      id: `mov_${index}_${type}`,
      sku,
      type: type as InventoryMovement["type"],
      qty,
      reason: DEMO_SEED_MARKER,
      warehouse,
      at: isoAt(days),
    }));
  },
);

function buildStages(batchIndex: number, batchId: string): ProductionStage[] {
  const activeAt = batchIndex === 1 ? 4 : batchIndex === 2 ? 1 : 0;
  const completedBefore = batchIndex === 1 ? 4 : batchIndex === 0 ? 2 : 0;
  return STAGE_NAMES.map((name, stageIndex) => {
    const active = stageIndex === activeAt;
    const completed = stageIndex < completedBefore;
    const busy = completed || active;
    return {
      id: `stage_${batchId}_${stageIndex}`,
      name,
      status: (active ? "in_progress" : completed ? "completed" : "pending") as ProductionStage["status"],
      laborHours: busy ? 120 + stageIndex * 35 : 0,
      machineHours: busy ? 90 + stageIndex * 40 : 0,
      laborCost: busy ? (120 + stageIndex * 35) * 78 : 0,
      machineCost: busy ? (90 + stageIndex * 40) * 145 : 0,
      yieldPct: busy ? 97.5 : 0,
      scrapUnits: busy ? stageIndex + 2 : 0,
    };
  });
}

const BATCH_SPECS = [
  ["PB-24-0142", "SF-A7 Wafer Lot", "Helion Aerospace", 480, "2025-08-12", "2026-09-30", 13, "active", 1_842_500],
  ["PB-24-0156", "SF-X3 Module", "Atlas Defense Systems", 120, "2025-04-02", "2026-06-15", 14, "active", 2_410_000],
  ["PB-25-0008", "SF-A7 Wafer Lot", "Northwind Semis", 320, "2025-11-20", "2026-12-05", 12, "active", 612_400],
  ["PB-25-0021", "SF-Q9 Sensor Array", "Tessera Robotics", 1800, "2026-01-08", "2027-04-22", 15, "planning", 84_000],
] as const;

export const DEMO_BATCHES: ProductionBatch[] = BATCH_SPECS.map(
  ([code, product, client, units, startedAt, expectedCompletion, cycleMonths, status, wipValue], index) => {
    const id = `batch_demo_${code.replaceAll("-", "").toLowerCase()}`;
    return {
      id,
      code,
      product,
      client,
      units,
      startedAt,
      expectedCompletion,
      cycleMonths,
      stages: buildStages(index, id),
      wipValue,
      status: status as ProductionBatch["status"],
    };
  },
);

export const DEMO_BOMS: BomVersion[] = [
  {
    id: "bom_demo_SF-A7",
    bomCode: "BOM-SF-A7",
    name: "SF-A7 Production BOM",
    version: "1.0",
    productSku: "SF-A7",
    effectiveFrom: dateOnly(-180),
    notes: "Presenter Mode standard production bill of materials",
    lines: [
      { id: "bom_line_SF-A7_0", sku: "RAW-SIL-100", material: "Silicon Wafer 100mm", qtyPerUnit: 1, uom: "ea", unitCost: 42.5 },
      { id: "bom_line_SF-A7_1", sku: "RAW-RES-01", material: "Photoresist Compound", qtyPerUnit: 0.12, uom: "L", unitCost: 95 },
      { id: "bom_line_SF-A7_2", sku: "PKG-BOX-A", material: "Anti-Static Packaging Box A", qtyPerUnit: 1, uom: "ea", unitCost: 2.4 },
    ],
  },
  {
    id: "bom_demo_SF-X3",
    bomCode: "BOM-SF-X3",
    name: "SF-X3 Production BOM",
    version: "1.0",
    productSku: "SF-X3",
    effectiveFrom: dateOnly(-180),
    notes: "Presenter Mode standard production bill of materials",
    lines: [
      { id: "bom_line_SF-X3_0", sku: "RAW-SIL-100", material: "Silicon Wafer 100mm", qtyPerUnit: 0.4, uom: "ea", unitCost: 42.5 },
      { id: "bom_line_SF-X3_1", sku: "RAW-COP-50", material: "Copper Foil Roll 50m", qtyPerUnit: 0.3, uom: "roll", unitCost: 18.75 },
      { id: "bom_line_SF-X3_2", sku: "PKG-FOAM-02", material: "Protective Foam Insert", qtyPerUnit: 1, uom: "ea", unitCost: 0.85 },
    ],
  },
  {
    id: "bom_demo_SF-Q9",
    bomCode: "BOM-SF-Q9",
    name: "SF-Q9 Production BOM",
    version: "1.0",
    productSku: "SF-Q9",
    effectiveFrom: dateOnly(-180),
    notes: "Presenter Mode standard production bill of materials",
    lines: [
      { id: "bom_line_SF-Q9_0", sku: "RAW-SIL-100", material: "Silicon Wafer 100mm", qtyPerUnit: 0.08, uom: "ea", unitCost: 42.5 },
      { id: "bom_line_SF-Q9_1", sku: "RAW-RES-01", material: "Photoresist Compound", qtyPerUnit: 0.03, uom: "L", unitCost: 95 },
      { id: "bom_line_SF-Q9_2", sku: "PKG-BOX-A", material: "Anti-Static Packaging Box A", qtyPerUnit: 1, uom: "ea", unitCost: 2.4 },
    ],
  },
];

export const DEMO_MATERIAL_USAGE: MaterialUsage[] = DEMO_BATCHES.flatMap((batch) =>
  (["RAW-SIL-100", "RAW-RES-01", "PKG-BOX-A"] as const).map((sku, materialIndex) => ({
    id: `material_${batch.id}_${materialIndex}`,
    batchId: batch.id,
    sku,
    qty: 20 * (materialIndex + 1),
    at: isoAt(-20 + materialIndex),
  })),
);

export const DEMO_LABOR: LaborEntry[] = DEMO_BATCHES.flatMap((batch, batchIndex) => {
  const activeAt = batchIndex === 1 ? 4 : batchIndex === 2 ? 1 : 0;
  const completedBefore = batchIndex === 1 ? 4 : batchIndex === 0 ? 2 : 0;
  return STAGE_NAMES.flatMap((_, stageIndex) => {
    const busy = stageIndex < completedBefore || stageIndex === activeAt;
    if (!busy) return [];
    return [
      {
        id: `labor_${batch.id}_${stageIndex}`,
        batchId: batch.id,
        stageId: `stage_${batch.id}_${stageIndex}`,
        hours: 120 + stageIndex * 35,
        rate: 78,
        at: isoAt(-30 + stageIndex),
      },
    ];
  });
});

export const DEMO_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: "po_demo_mr001",
    poNumber: "PO-2026-0101",
    vendorCode: "V-2210",
    vendorName: "Wafertek Materials",
    warehouseId: "loc_wh_central",
    expectedDelivery: dateOnly(21),
    taxAmount: 0,
    shippingAmount: 600,
    notes: "Material Request MR-2026-001: replenish silicon safety stock",
    status: "draft",
    lines: [{ sku: "RAW-SIL-100", description: "Silicon Wafer 100mm", qty: 500, unitCost: 42.5 }],
    createdAt: dateOnly(-2),
  },
  {
    id: "po_demo_approved",
    poNumber: "PO-2026-0102",
    vendorCode: "V-2211",
    vendorName: "Lumen Optics GmbH",
    warehouseId: "loc_wh_west",
    expectedDelivery: dateOnly(12),
    taxAmount: 0,
    shippingAmount: 850,
    notes: "Optics replenishment",
    status: "approved",
    lines: [{ sku: "TOOL-PROBE-X", description: "Precision Test Probe Kit", qty: 20, unitCost: 310 }],
    createdAt: dateOnly(-5),
    approvedAt: dateOnly(-4),
    requestedByUserId: "demo-presenter-user",
    requestedByName: "Demo Presenter",
  },
  {
    id: "po_demo_received",
    poNumber: "PO-2026-0098",
    vendorCode: "V-2212",
    vendorName: "PrecisionPCB Co.",
    warehouseId: "loc_wh_east",
    expectedDelivery: dateOnly(-4),
    taxAmount: 0,
    shippingAmount: 400,
    notes: "Material Request MR-2026-002: PCB production supply",
    status: "received",
    lines: [{ sku: "RAW-COP-50", description: "Copper Foil Roll 50m", qty: 100, unitCost: 18.75 }],
    createdAt: dateOnly(-15),
    approvedAt: dateOnly(-14),
    requestedByUserId: "demo-presenter-user",
    requestedByName: "Demo Presenter",
  },
];

export const DEMO_GOODS_RECEIPTS: GoodsReceipt[] = [
  {
    id: "gr_demo_po_received",
    poId: "po_demo_received",
    receivedAt: isoAt(-4),
    sku: "RAW-COP-50",
    qty: 100,
  },
];

export const DEMO_EMPLOYEES: EmployeeDto[] = [
  { id: "emp_demo_0", name: "Avery Chen", jobTitle: "Production Tech", payType: "HOURLY", taxClassification: "W2", baseWage: 39, status: "ACTIVE" },
  { id: "emp_demo_1", name: "Morgan Reed", jobTitle: "CNC Operator", payType: "HOURLY", taxClassification: "W2", baseWage: 42, status: "ACTIVE" },
  { id: "emp_demo_2", name: "Jordan Patel", jobTitle: "QA Inspector", payType: "HOURLY", taxClassification: "W2", baseWage: 44, status: "ACTIVE" },
  { id: "emp_demo_3", name: "Casey Brooks", jobTitle: "Warehouse Lead", payType: "SALARIED", taxClassification: "W2", baseWage: 78000, status: "ACTIVE" },
  { id: "emp_demo_4", name: "Riley Morgan", jobTitle: "Buyer", payType: "SALARIED", taxClassification: "W2", baseWage: 72000, status: "ACTIVE" },
  { id: "emp_demo_5", name: "Taylor Kim", jobTitle: "Controller", payType: "SALARIED", taxClassification: "W2", baseWage: 98000, status: "ACTIVE" },
  { id: "emp_demo_6", name: "Drew Wilson", jobTitle: "Sales AE", payType: "SALARIED", taxClassification: "1099", baseWage: 88000, status: "ACTIVE" },
  { id: "emp_demo_7", name: "Alex Rivera", jobTitle: "Plant Manager", payType: "SALARIED", taxClassification: "W2", baseWage: 115000, status: "ACTIVE" },
];

export const DEMO_V2210_BILLS: ApBill[] = [
  {
    id: "ap_demo_v2210",
    billNumber: "BILL-2026-V2210",
    vendorCode: "V-2210",
    vendorName: "Wafertek Materials",
    lines: [{ description: "Presenter Mode operational supply", qty: 1, unitCost: 50400 }],
    subtotal: 50400,
    tax: 0,
    total: 50400,
    amountPaid: 20000,
    balance: 30400,
    status: "partial",
    billDate: dateOnly(-35),
    dueDate: dateOnly(-5),
  },
];

export const DEMO_V2210_PAYMENTS: VendorLedgerPayment[] = [
  {
    id: "ap_pay_demo_v2210",
    vendorCode: "V-2210",
    amount: 20000,
    method: "ACH",
    paidAt: dateOnly(-20),
    memo: "Presenter Mode partial payment",
  },
];

export function getDemoVendorLedger(code: string): VendorLedgerResult {
  const normalized = code.trim().toUpperCase();
  if (normalized === "V-2210") {
    return {
      bills: DEMO_V2210_BILLS.map((b) => ({ ...b })),
      payments: DEMO_V2210_PAYMENTS.map((p) => ({ ...p })),
      balance: 30400,
      source: "demo-fallback",
    };
  }
  return { bills: [], payments: [], balance: 0, source: "demo-fallback" };
}
