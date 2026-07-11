import * as XLSX from "xlsx";
import type { ImportRow } from "./types";

export async function parseSpreadsheet(file: File): Promise<{ headers: string[]; rows: ImportRow[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (json.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(json[0]);
  const rows: ImportRow[] = json.map((r) => {
    const row: ImportRow = {};
    for (const h of headers) {
      const v = r[h];
      row[h] = v === null || v === undefined ? "" : typeof v === "object" ? String(v) : (v as string | number | boolean);
    }
    return row;
  });
  return { headers, rows };
}
