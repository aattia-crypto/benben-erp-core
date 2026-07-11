import { app } from "electron";

import { logger } from "../utils/logger";

export type ReleaseChannel = "stable" | "beta" | "internal";

export type UpdateManifestEntry = {
  version: string;
  releaseNotes?: string;
  downloadUrl?: string;
  publishedAt?: string;
};

export type UpdateCheckResult = {
  ok: boolean;
  currentVersion: string;
  channel: ReleaseChannel;
  updateAvailable: boolean;
  latest: UpdateManifestEntry | null;
  error?: string;
  checkedAt: string;
};

export type UpdateSchedulerStatus = {
  schedulerRunning: boolean;
  channel: ReleaseChannel;
  lastCheck: UpdateCheckResult | null;
  nextCheckDueAt: string | null;
};

type GitHubReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

type GitHubLatestRelease = {
  tag_name?: string;
  body?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
};

type UpdateCheckSource = "boot" | "scheduled" | "manual";

const GITHUB_RELEASES_URL =
  process.env.BENBEN_GITHUB_RELEASES_URL?.trim() ||
  process.env.NEXUSCORE_GITHUB_RELEASES_URL?.trim() ||
  process.env.NEXUSCORE_UPDATE_MANIFEST_URL?.trim() ||
  "https://api.github.com/repos/aattia-crypto/benben-erp/releases/latest";

const DAILY_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 15 * 60 * 1000;

const DEFAULT_CHANNEL = normalizeChannel(process.env.BENBEN_RELEASE_CHANNEL);

let timer: ReturnType<typeof setInterval> | null = null;
let schedulerChannel: ReleaseChannel = DEFAULT_CHANNEL;
let lastCheck: UpdateCheckResult | null = null;
let lastCheckAtMs = 0;

function normalizeChannel(value: string | undefined): ReleaseChannel {
  if (value === "beta" || value === "internal" || value === "stable") return value;
  return "stable";
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function githubRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Benben-ERP-Desktop",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.BENBEN_GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function pickReleaseAsset(assets: GitHubReleaseAsset[] | undefined): GitHubReleaseAsset | null {
  if (!assets?.length) return null;
  if (process.platform === "win32") {
    const exe = assets.find((a) => a.name?.toLowerCase().endsWith(".exe"));
    if (exe?.browser_download_url) return exe;
  }
  return assets[0] ?? null;
}

function parseGitHubRelease(release: GitHubLatestRelease, currentVersion: string): UpdateManifestEntry {
  const tag = release.tag_name?.trim() || currentVersion;
  const version = tag.replace(/^v/i, "");
  const asset = pickReleaseAsset(release.assets);
  return {
    version,
    releaseNotes: release.body?.trim() || undefined,
    downloadUrl: asset?.browser_download_url,
    publishedAt: release.published_at,
  };
}

export async function checkForUpdates(channel: ReleaseChannel): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const checkedAt = new Date().toISOString();

  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: githubRequestHeaders(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        currentVersion,
        channel,
        updateAvailable: false,
        latest: null,
        error: `GitHub Releases API returned ${res.status}`,
        checkedAt,
      };
    }
    const release = (await res.json()) as GitHubLatestRelease;
    const latest = parseGitHubRelease(release, currentVersion);
    const updateAvailable = compareVersions(currentVersion, latest.version) < 0;

    return {
      ok: true,
      currentVersion,
      channel,
      updateAvailable,
      latest,
      checkedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      currentVersion,
      channel,
      updateAvailable: false,
      latest: null,
      error: message,
      checkedAt,
    };
  }
}

function logUpdateCheckResult(result: UpdateCheckResult, source: UpdateCheckSource): void {
  if (result.updateAvailable && result.latest) {
    logger.info("Update available", {
      source,
      channel: result.channel,
      currentVersion: result.currentVersion,
      latestVersion: result.latest.version,
      releaseNotes: result.latest.releaseNotes ?? null,
      downloadUrl: result.latest.downloadUrl ?? null,
    });
    return;
  }
  if (result.ok) {
    logger.info("Update check — up to date", {
      source,
      channel: result.channel,
      currentVersion: result.currentVersion,
      latestVersion: result.latest?.version ?? result.currentVersion,
    });
    return;
  }
  logger.warn("Update check failed", {
    source,
    channel: result.channel,
    error: result.error,
  });
}

async function runUpdateCheck(
  channel: ReleaseChannel,
  source: UpdateCheckSource,
): Promise<UpdateCheckResult> {
  const result = await checkForUpdates(channel);
  lastCheck = result;
  lastCheckAtMs = Date.now();
  logUpdateCheckResult(result, source);
  return result;
}

export function getUpdateSchedulerStatus(): UpdateSchedulerStatus {
  const nextCheckDueAt =
    lastCheckAtMs > 0 ? new Date(lastCheckAtMs + DAILY_MS).toISOString() : null;
  return {
    schedulerRunning: timer !== null,
    channel: schedulerChannel,
    lastCheck,
    nextCheckDueAt,
  };
}

/** Run daily update check when interval elapsed (mirrors backup scheduler cadence). */
export async function runScheduledUpdateCheckIfDue(): Promise<UpdateCheckResult | null> {
  if (lastCheckAtMs > 0 && Date.now() - lastCheckAtMs < DAILY_MS) {
    return null;
  }
  return runUpdateCheck(schedulerChannel, "scheduled");
}

export async function runManualUpdateCheck(channel?: ReleaseChannel): Promise<UpdateCheckResult> {
  const ch = channel ?? schedulerChannel;
  return runUpdateCheck(ch, "manual");
}

export function startUpdateScheduler(channel?: ReleaseChannel): void {
  stopUpdateScheduler();
  if (channel) schedulerChannel = channel;
  void runUpdateCheck(schedulerChannel, "boot");
  timer = setInterval(() => {
    void runScheduledUpdateCheckIfDue();
  }, TICK_MS);
  logger.info("Update scheduler started", {
    channel: schedulerChannel,
    releasesUrl: GITHUB_RELEASES_URL,
    checkIntervalHours: DAILY_MS / (60 * 60 * 1000),
    tickMinutes: TICK_MS / (60 * 1000),
  });
}

export function stopUpdateScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
