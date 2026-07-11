import { getEmailSettings, type EmailSettings } from "./org-profile";
import { isDesktopShell } from "./desktop-api";
import { logClientError } from "./error-log";

export type EmailDeliveryResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  attemptedAt: string;
};

function toDto(settings: EmailSettings) {
  return { ...settings };
}

export async function desktopSendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  settings?: EmailSettings;
}): Promise<EmailDeliveryResult> {
  if (!isDesktopShell()) {
    return {
      ok: false,
      error: "Email delivery requires the Benben desktop app.",
      attemptedAt: new Date().toISOString(),
    };
  }

  const settings = input.settings ?? getEmailSettings();
  const res = (await window.benben!.email.send({
    settings: toDto(settings),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })) as { ok?: boolean; data?: EmailDeliveryResult; error?: string };

  const result: EmailDeliveryResult = res?.data ?? {
    ok: false,
    error: res?.error ?? "Send failed",
    attemptedAt: new Date().toISOString(),
  };

  if (!result.ok) {
    logClientError("email", result.error ?? "Send failed", { to: input.to, subject: input.subject });
  }

  return result;
}

export async function desktopTestEmail(to: string): Promise<EmailDeliveryResult> {
  if (!isDesktopShell()) {
    return { ok: false, error: "Desktop app required", attemptedAt: new Date().toISOString() };
  }
  const settings = getEmailSettings();
  const res = (await window.benben!.email.test({ settings: toDto(settings), to })) as {
    ok?: boolean;
    data?: EmailDeliveryResult;
    error?: string;
  };
  return (
    res?.data ?? {
      ok: false,
      error: res?.error ?? "Test failed",
      attemptedAt: new Date().toISOString(),
    }
  );
}

export async function desktopVerifySmtp(): Promise<EmailDeliveryResult> {
  if (!isDesktopShell()) {
    return { ok: false, error: "Desktop app required", attemptedAt: new Date().toISOString() };
  }
  const res = (await window.benben!.email.verifyConnection(toDto(getEmailSettings()))) as {
    ok?: boolean;
    data?: EmailDeliveryResult;
    error?: string;
  };
  return res?.data ?? { ok: false, error: res?.error ?? "Verify failed", attemptedAt: new Date().toISOString() };
}
