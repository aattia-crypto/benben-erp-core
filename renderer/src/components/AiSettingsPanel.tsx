import { useEffect, useState } from "react";
import { KeyRound, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Panel, erp, ErpFieldLabel } from "@/components/ui-bits";
import { desktopAiConfigured, desktopSaveAiApiKey, isAiDesktopAvailable } from "@/lib/ai-client";

export function AiSettingsPanel() {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const desktop = isAiDesktopAvailable();

  useEffect(() => {
    void desktopAiConfigured().then(setConfigured);
  }, []);

  async function save() {
    if (!apiKey.trim()) {
      toast.error("Enter an API key.");
      return;
    }
    setBusy(true);
    const res = await desktopSaveAiApiKey(apiKey.trim());
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not save API key.");
      return;
    }
    toast.success("AI API key saved to config.json.");
    setConfigured(true);
    setApiKey("");
  }

  return (
    <div id="ai-assistant" className="scroll-mt-6">
    <Panel title="AI Assistant">
      <div className="mb-3 flex items-start gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-brand/10 text-brand">
          <Sparkles className="h-4 w-4" />
        </div>
        <p className="text-sm text-muted-foreground">
          Connect an OpenAI-compatible provider for the Benben AI Copilot. Keys are stored locally in{" "}
          <span className="font-mono text-xs">config.json</span> (or via{" "}
          <span className="font-mono text-xs">BENBEN_AI_KEY</span> environment variable). Keys are never sent to
          Benben servers.
        </p>
      </div>

      {configured && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <KeyRound className="h-3.5 w-3.5 shrink-0" />
          AI provider configured
        </div>
      )}

      {!desktop && (
        <p className="mb-3 text-xs text-warning">
          Save to disk is available in the Benben desktop app. Browser preview cannot persist keys to config.json.
        </p>
      )}

      <label className="block max-w-lg">
        <ErpFieldLabel>API key</ErpFieldLabel>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={configured ? "Enter new key to rotate" : "sk-…"}
          className={`mt-1 ${erp.input}`}
          disabled={!desktop}
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!desktop || busy}
          className={erp.actionBtn}
        >
          {busy ? "Saving…" : "Save API key"}
        </button>
      </div>
    </Panel>
    </div>
  );
}
