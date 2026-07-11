// Mock data for Benben ERP — in-memory, replaces PGlite/D1 in v1

import { randomUUID } from "./uuid";
export type EntityKind = "client" | "vendor" | "both";
export interface Entity {
  id: string;
  code: string;
  name: string;
  kind: EntityKind;
  country: string;
  contact: string;
  address?: string;
  phone?: string;
  taxId?: string;
  paymentTerms?: string;
  ytdValue: number;
  status: "active" | "inactive";
}

export type StageStatus = "pending" | "in_progress" | "completed" | "blocked";
export interface ProductionStage {
  id: string;
  name: string;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  laborHours: number;
  machineHours: number;
  laborCost: number;
  machineCost: number;
  yieldPct: number;
  scrapUnits: number;
}

export interface ProductionBatch {
  id: string;
  code: string;
  product: string;
  client: string;
  units: number;
  startedAt: string;
  expectedCompletion: string;
  cycleMonths: number;
  stages: ProductionStage[];
  wipValue: number;
  status: "planning" | "active" | "qa" | "completed";
}

export interface Account {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  balance: number;
}

export interface JournalLine {
  account: string; // code
  debit: number;
  credit: number;
}
export interface JournalEntry {
  id: string;
  date: string;
  ref: string;
  memo: string;
  source: "sales" | "production" | "ap" | "manual" | "payroll";
  lines: JournalLine[];
  posted: true; // immutable
}

export interface ForecastRow {
  sku: string;
  product: string;
  onHand: number;
  safetyStock: number;
  monthly: number[]; // 18 months projected on-hand
}

export const entities: Entity[] = [
  { id: "e1", code: "C-1042", name: "Helion Aerospace", kind: "client", country: "USA", contact: "procurement@helion.aero", ytdValue: 4_820_000, status: "active" },
  { id: "e2", code: "C-1043", name: "Northwind Semis", kind: "client", country: "USA", contact: "buyers@northwind.io", ytdValue: 2_140_000, status: "active" },
  { id: "e3", code: "C-1044", name: "Tessera Robotics", kind: "client", country: "JPN", contact: "supply@tessera.jp", ytdValue: 1_360_500, status: "active" },
  { id: "e4", code: "V-2210", name: "Wafertek Materials", kind: "vendor", country: "TWN", contact: "sales@wafertek.tw", ytdValue: 980_000, status: "active" },
  { id: "e5", code: "V-2211", name: "Lumen Optics GmbH", kind: "vendor", country: "DEU", contact: "orders@lumen.de", ytdValue: 612_300, status: "active" },
  { id: "e6", code: "V-2212", name: "PrecisionPCB Co.", kind: "vendor", country: "KOR", contact: "ap@precisionpcb.kr", ytdValue: 240_900, status: "active" },
  { id: "e7", code: "B-3001", name: "Atlas Defense Systems", kind: "both", country: "USA", contact: "ops@atlasdef.com", ytdValue: 3_200_000, status: "active" },
  { id: "e8", code: "C-1045", name: "Veridian Sensors", kind: "client", country: "GBR", contact: "po@veridian.uk", ytdValue: 410_000, status: "inactive" },
];

const stage = (
  name: string,
  status: StageStatus,
  laborH: number,
  machineH: number,
  yieldPct: number,
  scrap: number,
): ProductionStage => ({
  id: randomUUID(),
  name,
  status,
  laborHours: laborH,
  machineHours: machineH,
  laborCost: laborH * 78,
  machineCost: machineH * 145,
  yieldPct,
  scrapUnits: scrap,
});

export const batches: ProductionBatch[] = [
  {
    id: "b1", code: "PB-24-0142", product: "SF-A7 Wafer Lot", client: "Helion Aerospace",
    units: 480, startedAt: "2025-08-12", expectedCompletion: "2026-09-30", cycleMonths: 13,
    status: "active", wipValue: 1_842_500,
    stages: [
      stage("Substrate Prep", "completed", 220, 180, 99.2, 4),
      stage("Photolithography", "completed", 540, 690, 97.8, 11),
      stage("Etch & Deposition", "in_progress", 320, 410, 96.5, 17),
      stage("Doping", "pending", 0, 0, 0, 0),
      stage("Metallization", "pending", 0, 0, 0, 0),
      stage("Test & Burn-In", "pending", 0, 0, 0, 0),
      stage("Final QA / Packaging", "pending", 0, 0, 0, 0),
    ],
  },
  {
    id: "b2", code: "PB-24-0156", product: "SF-X3 Module", client: "Atlas Defense Systems",
    units: 120, startedAt: "2025-04-02", expectedCompletion: "2026-06-15", cycleMonths: 14,
    status: "active", wipValue: 2_410_000,
    stages: [
      stage("Substrate Prep", "completed", 180, 140, 99.5, 1),
      stage("Photolithography", "completed", 480, 600, 98.1, 6),
      stage("Etch & Deposition", "completed", 360, 470, 96.9, 9),
      stage("Doping", "completed", 210, 300, 97.4, 5),
      stage("Metallization", "in_progress", 290, 380, 95.8, 12),
      stage("Test & Burn-In", "pending", 0, 0, 0, 0),
      stage("Final QA / Packaging", "pending", 0, 0, 0, 0),
    ],
  },
  {
    id: "b3", code: "PB-25-0008", product: "SF-A7 Wafer Lot", client: "Northwind Semis",
    units: 320, startedAt: "2025-11-20", expectedCompletion: "2026-12-05", cycleMonths: 12,
    status: "active", wipValue: 612_400,
    stages: [
      stage("Substrate Prep", "completed", 200, 160, 99.0, 5),
      stage("Photolithography", "in_progress", 280, 340, 97.2, 8),
      stage("Etch & Deposition", "pending", 0, 0, 0, 0),
      stage("Doping", "pending", 0, 0, 0, 0),
      stage("Metallization", "pending", 0, 0, 0, 0),
      stage("Test & Burn-In", "pending", 0, 0, 0, 0),
      stage("Final QA / Packaging", "pending", 0, 0, 0, 0),
    ],
  },
  {
    id: "b4", code: "PB-25-0021", product: "SF-Q9 Sensor Array", client: "Tessera Robotics",
    units: 1_800, startedAt: "2026-01-08", expectedCompletion: "2027-04-22", cycleMonths: 15,
    status: "planning", wipValue: 84_000,
    stages: [
      stage("Substrate Prep", "in_progress", 90, 60, 98.4, 2),
      stage("Photolithography", "pending", 0, 0, 0, 0),
      stage("Etch & Deposition", "pending", 0, 0, 0, 0),
      stage("Doping", "pending", 0, 0, 0, 0),
      stage("Metallization", "pending", 0, 0, 0, 0),
      stage("Test & Burn-In", "pending", 0, 0, 0, 0),
      stage("Final QA / Packaging", "pending", 0, 0, 0, 0),
    ],
  },
];

export const accounts: Account[] = [
  { code: "1000", name: "Cash & Equivalents", type: "asset", balance: 8_420_000 },
  { code: "1100", name: "Accounts Receivable", type: "asset", balance: 3_215_400 },
  { code: "1200", name: "Raw Materials Inventory", type: "asset", balance: 2_104_900 },
  { code: "1210", name: "Work-In-Process (WIP)", type: "asset", balance: 4_948_900 },
  { code: "1220", name: "Finished Goods", type: "asset", balance: 1_780_200 },
  { code: "1500", name: "Plant & Equipment", type: "asset", balance: 18_400_000 },
  { code: "2000", name: "Accounts Payable", type: "liability", balance: 1_640_300 },
  { code: "2100", name: "Accrued Wages", type: "liability", balance: 412_700 },
  { code: "2500", name: "Long-term Debt", type: "liability", balance: 6_200_000 },
  { code: "3000", name: "Common Stock", type: "equity", balance: 10_000_000 },
  { code: "3100", name: "Retained Earnings", type: "equity", balance: 12_416_400 },
  { code: "4000", name: "Product Revenue", type: "revenue", balance: 24_812_000 },
  { code: "5000", name: "Cost of Goods Sold", type: "expense", balance: 14_205_000 },
  { code: "5100", name: "Direct Labor", type: "expense", balance: 3_812_000 },
  { code: "5200", name: "Machine / Overhead", type: "expense", balance: 2_904_000 },
  { code: "5500", name: "Operating Expense", type: "expense", balance: 1_812_000 },
];

export const journal: JournalEntry[] = [
  {
    id: "j1", date: "2026-05-10", ref: "SO-8821", memo: "Helion AR — SF-A7 shipment", source: "sales", posted: true,
    lines: [
      { account: "1100", debit: 482_000, credit: 0 },
      { account: "4000", debit: 0, credit: 482_000 },
    ],
  },
  {
    id: "j2", date: "2026-05-10", ref: "SO-8821", memo: "COGS recognition", source: "sales", posted: true,
    lines: [
      { account: "5000", debit: 281_400, credit: 0 },
      { account: "1220", debit: 0, credit: 281_400 },
    ],
  },
  {
    id: "j3", date: "2026-05-09", ref: "PB-24-0142/S3", memo: "WIP capitalization — Etch stage", source: "production", posted: true,
    lines: [
      { account: "1210", debit: 84_400, credit: 0 },
      { account: "5100", debit: 0, credit: 24_960 },
      { account: "5200", debit: 0, credit: 59_440 },
    ],
  },
  {
    id: "j4", date: "2026-05-08", ref: "PB-24-0156", memo: "Production complete — transfer to FG", source: "production", posted: true,
    lines: [
      { account: "1220", debit: 1_204_000, credit: 0 },
      { account: "1210", debit: 0, credit: 1_204_000 },
    ],
  },
  {
    id: "j5", date: "2026-05-07", ref: "AP-4412", memo: "Wafertek raw materials receipt", source: "ap", posted: true,
    lines: [
      { account: "1200", debit: 218_700, credit: 0 },
      { account: "2000", debit: 0, credit: 218_700 },
    ],
  },
];

export const forecast: ForecastRow[] = [
  { sku: "RM-SUB-300", product: "300mm Substrate", onHand: 1_240, safetyStock: 800,
    monthly: [1180, 1110, 990, 880, 760, 640, 520, 410, 320, 250, 190, 140, 90, 60, 40, 30, 20, 10] },
  { sku: "RM-PH-RES", product: "Photoresist (L)", onHand: 480, safetyStock: 200,
    monthly: [460, 430, 400, 360, 320, 280, 240, 210, 180, 150, 120, 90, 70, 50, 40, 30, 20, 10] },
  { sku: "RM-DOP-B", product: "Dopant Boron Cell", onHand: 90, safetyStock: 60,
    monthly: [88, 84, 78, 72, 64, 56, 48, 40, 33, 27, 22, 18, 14, 11, 9, 7, 6, 5] },
  { sku: "RM-MTL-CU", product: "Copper Sputter Target", onHand: 32, safetyStock: 20,
    monthly: [31, 30, 28, 26, 24, 22, 19, 17, 15, 13, 11, 9, 7, 6, 5, 4, 3, 2] },
  { sku: "RM-PCB-08", product: "8L Carrier PCB", onHand: 2_400, safetyStock: 1_200,
    monthly: [2300, 2150, 1980, 1810, 1650, 1490, 1340, 1190, 1050, 920, 800, 690, 590, 500, 420, 350, 290, 240] },
];

export const kpis = {
  openOrders: 47,
  activeBatches: batches.filter((b) => b.status !== "completed").length,
  wipValue: batches.reduce((s, b) => s + b.wipValue, 0),
  arBalance: 3_215_400,
  apBalance: 1_640_300,
  monthRevenue: 2_140_000,
  yieldAvg: 97.4,
  scrapRate: 2.6,
};
