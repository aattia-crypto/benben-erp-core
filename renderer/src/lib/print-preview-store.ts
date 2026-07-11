/** Lightweight module store — opens print preview from non-React export utilities. */

export type PrintPreviewPayload = {
  html: string;
  title: string;
};

type PrintPreviewState = {
  open: boolean;
  html: string;
  title: string;
};

const DEFAULT_TITLE = "Benben Report";

let state: PrintPreviewState = {
  open: false,
  html: "",
  title: DEFAULT_TITLE,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getPrintPreviewState(): PrintPreviewState {
  return state;
}

export function subscribePrintPreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openPrintPreview(payload: PrintPreviewPayload): void {
  state = {
    open: true,
    html: payload.html,
    title: payload.title.trim() || DEFAULT_TITLE,
  };
  emit();
}

export function closePrintPreview(): void {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}
