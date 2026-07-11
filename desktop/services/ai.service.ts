/**
 * Foundational AI agentry — natural-language queries bridged to Benben app context.
 * API credentials are never hardcoded; resolved from env or AppData config.json.
 */
import { getPrisma } from "./database";
import { readAppConfig } from "./app-config.service";
import { logger } from "../utils/logger";

const DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_PROMPT_CHARS = 8_000;
const REQUEST_TIMEOUT_MS = 60_000;

export type AiClientConfig = {
  apiKey: string;
  apiUrl: string;
  model: string;
};

const MISSING_KEY_MESSAGE =
  "AI assistant is not configured yet. Set your API key in Settings (config.json: \"aiApiKey\") " +
  "or define the BENBEN_AI_KEY environment variable, then restart Benben.";

const OFFLINE_MESSAGE =
  "Cannot reach the AI service right now. Check your internet connection and firewall settings, then try again.";

/** Resolve API key: environment overrides persisted application settings. */
export function resolveAiApiKey(): string | null {
  const fromEnv = process.env.BENBEN_AI_KEY?.trim() || process.env.NEXUSCORE_AI_KEY?.trim();
  if (fromEnv) return fromEnv;
  const cfg = readAppConfig();
  const fromSettings = cfg.aiApiKey?.trim();
  return fromSettings || null;
}

export function resolveAiClientConfig(): AiClientConfig | null {
  const apiKey = resolveAiApiKey();
  if (!apiKey) return null;
  const cfg = readAppConfig();
  return {
    apiKey,
    apiUrl:
      process.env.BENBEN_AI_API_URL?.trim() ||
      process.env.NEXUSCORE_AI_API_URL?.trim() ||
      cfg.aiApiUrl?.trim() ||
      DEFAULT_API_URL,
    model:
      process.env.BENBEN_AI_MODEL?.trim() ||
      process.env.NEXUSCORE_AI_MODEL?.trim() ||
      cfg.aiModel?.trim() ||
      DEFAULT_MODEL,
  };
}

function isLikelyOfflineError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    /fetch failed|network|offline|unable to connect/i.test(msg)
  );
}

/** Summarize live ERP data structures for the model system prompt (read-only). */
async function buildApplicationContext(): Promise<string> {
  try {
    const db = getPrisma();
    const settings = await db.settings.findFirst();
    const [userCount, employeeCount, arInvoiceCount, glAccountCount] = await Promise.all([
      db.user.count(),
      db.employee.count().catch(() => 0),
      db.arInvoice.count().catch(() => 0),
      db.glAccount.count().catch(() => 0),
    ]);

    const snapshot = {
      companyName: settings?.companyName ?? "Benben",
      currency: settings?.currency ?? "USD",
      modules: {
        users: userCount,
        hrEmployees: employeeCount,
        arInvoices: arInvoiceCount,
        glAccounts: glAccountCount,
      },
      capabilities: [
        "finance (GL, AR, AP, tax, budgets)",
        "HR (employees, timecards, payroll)",
        "inventory and manufacturing (UI stores; finance via PostgreSQL)",
        "permissions and audit logging",
      ],
    };

    return JSON.stringify(snapshot, null, 2);
  } catch (err) {
    logger.warn("AI context snapshot unavailable", err);
    return JSON.stringify({ note: "Application database context unavailable during this request." });
  }
}

async function callChatCompletions(
  client: AiClientConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(client.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${client.apiKey}`,
      },
      body: JSON.stringify({
        model: client.model,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    const body = (await response.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!response.ok) {
      const apiMsg = body.error?.message?.trim();
      throw new Error(apiMsg || `AI provider returned HTTP ${response.status}`);
    }

    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("AI provider returned an empty response.");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export class AiService {
  async processUserQuery(prompt: string): Promise<string> {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return "Please enter a question or instruction for the AI assistant.";
    }
    if (trimmed.length > MAX_PROMPT_CHARS) {
      return `Your message is too long (${trimmed.length} characters). Please shorten it to ${MAX_PROMPT_CHARS} characters or fewer.`;
    }

    const client = resolveAiClientConfig();
    if (!client) {
      return MISSING_KEY_MESSAGE;
    }

    const appContext = await buildApplicationContext();
    const systemPrompt =
      "You are Benben ERP Assistant, embedded in a local-first desktop ERP. " +
      "Answer concisely using the application context below. " +
      "Do not invent live database figures; if data is missing, say so and suggest where in Benben to look.\n\n" +
      `Application context:\n${appContext}`;

    try {
      return await callChatCompletions(client, systemPrompt, trimmed);
    } catch (err) {
      if (isLikelyOfflineError(err)) {
        logger.warn("AI request failed — likely offline", err);
        return OFFLINE_MESSAGE;
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error("AI request failed", { message });
      return `The AI service could not complete your request: ${message}`;
    }
  }
}

export const aiService = new AiService();
