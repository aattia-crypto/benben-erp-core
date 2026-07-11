import fs from "node:fs";
import path from "node:path";

import { getAttachmentsDir, getConfigPath } from "../utils/paths";
import { resolveAppDataRoot } from "../utils/platform";

const BRANDING_SCHEMA_VERSION = 1;
const DEFAULT_ACCENT = "oklch(0.65 0.24 252)";
const DEFAULT_PRODUCT_SUBTITLE = "ERP · Local-First";
const MAX_LOGO_BYTES = 512 * 1024;
const LOGO_REL_PREFIX = "attachments/branding-logo";

export type BrandingReportHeader = {
  line1: string;
  line2: string;
  line3: string;
};

export type BrandingAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type BrandingContact = {
  phone: string;
  email: string;
  taxId: string;
};

export type BrandingFiscal = {
  baseCurrency: string;
  taxRegion: string;
  fiscalYearStartMonth: number;
};

export type BrandingLogoRef = {
  storage: "file";
  path: string;
  mimeType: string;
};

/** Namespaced tenant branding persisted inside config.json (no inline base64). */
export type BrandingConfig = {
  schemaVersion: number;
  updatedAt: string;
  companyName: string;
  tagline: string;
  productSubtitle: string;
  invoicePrefix: string;
  accentColor: string;
  reportHeader: BrandingReportHeader;
  documentFooter: string;
  logo: BrandingLogoRef | null;
  address: BrandingAddress;
  contact: BrandingContact;
  fiscal: BrandingFiscal;
};

export type BrandingDto = Omit<BrandingConfig, "schemaVersion" | "logo"> & {
  logoDataUrl: string | null;
};

export type BrandingUpdateInput = Partial<
  Omit<BrandingConfig, "schemaVersion" | "updatedAt" | "logo">
> & {
  logoDataUrl?: string | null;
};

export type AppConfigFile = {
  schemaVersion?: number;
  aiApiKey?: string;
  aiApiUrl?: string;
  aiModel?: string;
  branding?: Partial<BrandingConfig>;
};

const DEFAULT_BRANDING: BrandingConfig = {
  schemaVersion: BRANDING_SCHEMA_VERSION,
  updatedAt: "",
  companyName: "",
  tagline: "",
  productSubtitle: DEFAULT_PRODUCT_SUBTITLE,
  invoicePrefix: "",
  accentColor: DEFAULT_ACCENT,
  reportHeader: { line1: "", line2: "", line3: "" },
  documentFooter: "Thank you for your business.",
  logo: null,
  address: {
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "USA",
  },
  contact: { phone: "", email: "", taxId: "" },
  fiscal: { baseCurrency: "USD", taxRegion: "US", fiscalYearStartMonth: 1 },
};

export function readAppConfig(): AppConfigFile {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as AppConfigFile;
  } catch {
    return {};
  }
}

function writeAppConfigFile(config: AppConfigFile): void {
  const configPath = getConfigPath();
  fs.mkdirSync(resolveAppDataRoot(), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function writeAppConfig(patch: AppConfigFile): void {
  writeAppConfigFile({ ...readAppConfig(), ...patch });
}

export function saveAiApiKeyToConfig(apiKey: string): void {
  writeAppConfig({ aiApiKey: apiKey.trim() });
}

export function isAiApiKeyConfigured(): boolean {
  const fromEnv = process.env.BENBEN_AI_KEY?.trim();
  if (fromEnv) return true;
  return Boolean(readAppConfig().aiApiKey?.trim());
}

function isSafeCssColor(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 120) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return true;
  return /^(oklch|hsl|hsla|rgb|rgba)\([^)]+\)$/.test(v);
}

function sanitizeInvoicePrefix(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9-]/g, "").slice(0, 8).toUpperCase();
}

function normalizeBranding(partial?: Partial<BrandingConfig>): BrandingConfig {
  const merged = { ...DEFAULT_BRANDING, ...partial };
  merged.schemaVersion = BRANDING_SCHEMA_VERSION;
  merged.accentColor = isSafeCssColor(merged.accentColor)
    ? merged.accentColor.trim()
    : DEFAULT_ACCENT;
  merged.invoicePrefix = sanitizeInvoicePrefix(merged.invoicePrefix);
  merged.reportHeader = {
    line1: merged.reportHeader?.line1?.trim() ?? "",
    line2: merged.reportHeader?.line2?.trim() ?? "",
    line3: merged.reportHeader?.line3?.trim() ?? "",
  };
  merged.logo = partial?.logo ?? merged.logo ?? null;
  return merged;
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new Error("Logo upload must be a valid data URL (PNG or JPEG).");
  }
  const mimeType = match[1].toLowerCase();
  if (!mimeType.startsWith("image/")) {
    throw new Error("Logo must be an image file (PNG or JPEG).");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) {
    throw new Error("Logo file is empty.");
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new Error(`Logo exceeds ${MAX_LOGO_BYTES / 1024}KB limit.`);
  }
  return { mimeType, buffer };
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

function resolveLogoAbsolute(logo: BrandingLogoRef): string {
  return path.join(resolveAppDataRoot(), logo.path.replace(/\//g, path.sep));
}

function readLogoDataUrl(logo: BrandingLogoRef | null): string | null {
  if (!logo?.path) return null;
  const abs = resolveLogoAbsolute(logo);
  if (!fs.existsSync(abs)) return null;
  try {
    const buffer = fs.readFileSync(abs);
    return `data:${logo.mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function persistBrandingLogo(dataUrl: string): BrandingLogoRef {
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const ext = extensionForMime(mimeType);
  fs.mkdirSync(getAttachmentsDir(), { recursive: true });

  for (const existing of fs.readdirSync(getAttachmentsDir())) {
    if (existing.startsWith("branding-logo.")) {
      fs.unlinkSync(path.join(getAttachmentsDir(), existing));
    }
  }

  const relPath = `${LOGO_REL_PREFIX}.${ext}`;
  const absPath = path.join(getAttachmentsDir(), `branding-logo.${ext}`);
  fs.writeFileSync(absPath, buffer, { mode: 0o600 });
  return { storage: "file", path: relPath, mimeType };
}

function clearBrandingLogo(current: BrandingLogoRef | null): null {
  if (current?.path) {
    const abs = resolveLogoAbsolute(current);
    if (fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch {
        /* optional */
      }
    }
  }
  return null;
}

export function toBrandingDto(config: BrandingConfig): BrandingDto {
  const { schemaVersion: _v, logo, ...rest } = config;
  return {
    ...rest,
    logoDataUrl: readLogoDataUrl(logo),
  };
}

export function getAppBranding(): BrandingDto {
  const cfg = readAppConfig();
  return toBrandingDto(normalizeBranding(cfg.branding));
}

export function updateAppBranding(input: BrandingUpdateInput): BrandingDto {
  const cfg = readAppConfig();
  const current = normalizeBranding(cfg.branding);
  const { logoDataUrl, ...patch } = input;

  let logo = current.logo;
  if (logoDataUrl === null) {
    logo = clearBrandingLogo(current.logo);
  } else if (typeof logoDataUrl === "string" && logoDataUrl.trim()) {
    logo = persistBrandingLogo(logoDataUrl);
  }

  const next = normalizeBranding({
    ...current,
    ...patch,
    reportHeader: { ...current.reportHeader, ...patch.reportHeader },
    address: { ...current.address, ...patch.address },
    contact: { ...current.contact, ...patch.contact },
    fiscal: { ...current.fiscal, ...patch.fiscal },
    logo,
    updatedAt: new Date().toISOString(),
  });

  writeAppConfigFile({
    ...cfg,
    branding: next,
  });

  return toBrandingDto(next);
}
