/**
 * USB barcode wedge: scanners type into a focused input and send Enter.
 * Camera QR: use ScanCameraDialog (lazy-loads html5-qrcode).
 */

import type { KeyboardEvent } from "react";

export function isScanEnter(e: KeyboardEvent): boolean {
  return e.key === "Enter";
}

export function normalizeScanPayload(raw: string): string {
  return raw.trim().replace(/\r?\n/g, "");
}
