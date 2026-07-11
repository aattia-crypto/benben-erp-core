import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, KeyRound, Send, Sparkles, WifiOff, X } from "lucide-react";
import { toast } from "sonner";

import { erp, ErpFieldLabel } from "@/components/ui-bits";
import {
  desktopAiConfigured,
  desktopSaveAiApiKey,
  isAiDesktopAvailable,
  sendAiQuery,
  type AiResponseKind,
} from "@/lib/ai-client";

export type ChatMessage = { role: "user" | "assistant"; text: string; kind?: AiResponseKind };

const SUGGESTIONS = [
  { emoji: "📊", label: "Summarize open AR financial exposure", prompt: "Summarize open AR financial exposure" },
  { emoji: "🏗️", label: "Check assembly line and BOM structures", prompt: "Check assembly line and BOM structures" },
  { emoji: "📦", label: "Review raw material inventory snapshot", prompt: "Review raw material inventory snapshot" },
] as const;

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-brand">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand [animation-delay:300ms]" />
      </span>
      Benben AI is thinking…
    </div>
  );
}

function InlineSetupAlert({
  kind,
  onSaved,
}: {
  kind: "missing_key" | "offline" | "unavailable";
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const tone =
    kind === "offline"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-brand/30 bg-brand/10 text-foreground";

  async function saveKey() {
    if (!apiKey.trim()) {
      toast.error("Enter your API key first.");
      return;
    }
    setSaving(true);
    const res = await desktopSaveAiApiKey(apiKey.trim());
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not save API key.");
      return;
    }
    toast.success("AI API key saved to application settings.");
    setApiKey("");
    onSaved();
  }

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tone}`}>
      {kind === "missing_key" && (
        <>
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-brand">
            <KeyRound className="h-3.5 w-3.5" /> Connect your AI provider
          </div>
          <p className="text-muted-foreground">
            Add an OpenAI-compatible API key below or open{" "}
            <Link to="/settings" hash="ai-assistant" className="font-medium text-brand hover:underline">
              Settings → AI Assistant
            </Link>
            .
          </p>
          {isAiDesktopAvailable() && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <ErpFieldLabel>API key</ErpFieldLabel>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-…"
                  className={`mt-1 ${erp.input}`}
                />
              </label>
              <button
                type="button"
                onClick={() => void saveKey()}
                disabled={saving}
                className={`${erp.actionBtn} shrink-0`}
              >
                {saving ? "Saving…" : "Save key"}
              </button>
            </div>
          )}
        </>
      )}
      {kind === "offline" && (
        <>
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <WifiOff className="h-3.5 w-3.5" /> You appear to be offline
          </div>
          <p className="text-muted-foreground">
            Reconnect to the internet, then send your question again.
          </p>
        </>
      )}
      {kind === "unavailable" && (
        <p className="text-muted-foreground">Launch the Benben desktop application to use the AI copilot.</p>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-slate-ink text-slate-ink-fg"
            : message.kind === "missing_key" || message.kind === "offline"
              ? "border border-border bg-surface text-foreground"
              : "border border-brand/20 bg-brand/5 text-foreground"
        }`}
      >
        {!isUser && (
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand">
            <Bot className="h-3 w-3" /> Assistant
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
}

export function AiCopilot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshStatus = useCallback(async () => {
    if (!isAiDesktopAvailable()) {
      setConfigured(false);
      return;
    }
    setConfigured(await desktopAiConfigured());
  }, []);

  useEffect(() => {
    if (open) void refreshStatus();
  }, [open, refreshStatus]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 120);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const submitPrompt = useCallback(
    async (raw: string) => {
      const prompt = raw.trim();
      if (!prompt || thinking) return;

      setMessages((prev) => [...prev, { role: "user", text: prompt }]);
      setInput("");
      setThinking(true);

      const result = await sendAiQuery(prompt);
      setThinking(false);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: result.text,
          kind: result.kind,
        },
      ]);

      if (result.kind === "missing_key") {
        setConfigured(false);
      }
    },
    [thinking],
  );

  function handleSend() {
    void submitPrompt(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const showEmpty = messages.length === 0 && !thinking;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const showInlineAlert =
    lastAssistant?.kind === "missing_key" ||
    lastAssistant?.kind === "offline" ||
    lastAssistant?.kind === "unavailable";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close AI Copilot" : "Open AI Copilot"}
        className={`fixed bottom-6 right-6 z-40 grid h-12 w-12 place-items-center rounded-full border shadow-lg transition-all ${
          open
            ? "border-border bg-card text-muted-foreground hover:text-foreground"
            : "border-brand/40 bg-gradient-to-br from-slate-900 to-slate-800 text-brand shadow-brand/20 hover:scale-105 hover:border-brand"
        }`}
        aria-expanded={open}
        aria-label="AI Copilot"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {open && (
        <div
          className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-border bg-gradient-to-b from-slate-950/98 via-background to-background shadow-2xl backdrop-blur-md"
          role="dialog"
          aria-label="Benben AI Copilot"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand/15 text-brand">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Benben AI Copilot</div>
                <div className="text-[11px] text-muted-foreground">
                  {configured === true
                    ? "Connected · secure IPC"
                    : configured === false
                      ? "API key required"
                      : "Natural language ERP assistant"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {showEmpty && (
              <div className="rounded-xl border border-dashed border-brand/25 bg-brand/5 px-4 py-6 text-center">
                <p className="text-sm font-medium text-foreground">Ask anything about your ERP data</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Finance, inventory, manufacturing, and HR context are shared securely from your local database.
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={`${m.role}-${i}`} message={m} />
            ))}

            {thinking && <ThinkingIndicator />}

            {showInlineAlert && lastAssistant?.kind && (
              <InlineSetupAlert
                kind={lastAssistant.kind}
                onSaved={() => void refreshStatus()}
              />
            )}
          </div>

          <div className="border-t border-border bg-surface/80 px-4 py-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.prompt}
                  type="button"
                  disabled={thinking}
                  onClick={() => {
                    setInput(s.prompt);
                    void submitPrompt(s.prompt);
                  }}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-foreground disabled:opacity-50"
                >
                  <span className="mr-1">{s.emoji}</span>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={thinking}
                placeholder="Ask Benben AI…"
                className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-border bg-erp-input px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={thinking || !input.trim()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground transition-opacity hover:bg-brand/90 disabled:opacity-40"
                title="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
