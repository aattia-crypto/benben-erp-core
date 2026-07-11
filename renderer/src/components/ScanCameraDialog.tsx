import { useEffect, useRef, useState } from "react";
import { ErpFormDialog } from "@/components/ErpFormDialog";
import { erp } from "@/components/ui-bits";

type ScanCameraDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
};

/**
 * Webcam QR scanner (html5-qrcode). Lazy-loaded so POS/inventory pages stay light
 * when camera is unused.
 */
export function ScanCameraDialog({ open, onOpenChange, onDetected }: ScanCameraDialogProps) {
  const regionId = "benben-qr-region";
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      void scannerRef.current?.stop();
      scannerRef.current = null;
      return;
    }

    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            onDetected(decoded);
            void scanner.stop();
            onOpenChange(false);
          },
          () => {
            /* ignore per-frame misses */
          },
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      void scannerRef.current?.stop();
      scannerRef.current = null;
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <ErpFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Scan QR code"
      description="Point the camera at a product or location QR label."
      submitLabel="Close"
      onSubmit={() => onOpenChange(false)}
      size="md"
    >
      <div id={regionId} className="min-h-[240px] overflow-hidden rounded-md border border-border bg-black/5" />
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">
        USB barcode scanners work in the text field without opening the camera.
      </p>
    </ErpFormDialog>
  );
}
