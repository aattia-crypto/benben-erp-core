import { useState } from "react";
import { ScanLine, Camera } from "lucide-react";
import { erp } from "@/components/ui-bits";
import { isScanEnter, normalizeScanPayload } from "@/lib/scan-utils";
import { ScanCameraDialog } from "@/components/ScanCameraDialog";

type ScanInputProps = {
  placeholder?: string;
  onScan: (code: string) => void;
  enableCamera?: boolean;
  className?: string;
};

/** Text field tuned for USB wedge + optional webcam QR. */
export function ScanInput({
  placeholder = "Scan barcode or QR…",
  onScan,
  enableCamera = true,
  className,
}: ScanInputProps) {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  function submit() {
    const code = normalizeScanPayload(value);
    if (!code) return;
    onScan(code);
    setValue("");
  }

  return (
    <>
      <div className={`flex gap-2 ${className ?? ""}`}>
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className={`${erp.input} pl-9`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (isScanEnter(e)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
          />
        </div>
        {enableCamera ? (
          <button type="button" className={erp.secondaryBtn} onClick={() => setCameraOpen(true)} title="Camera scan">
            <Camera className="h-4 w-4" />
          </button>
        ) : null}
        <button type="button" className={erp.actionBtn} onClick={submit}>
          Lookup
        </button>
      </div>
      {enableCamera ? (
        <ScanCameraDialog
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          onDetected={(code) => {
            onScan(code);
            setCameraOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
