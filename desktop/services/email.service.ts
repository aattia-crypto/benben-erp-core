import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { logger } from "../utils/logger";

export type EmailSettingsDto = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  useTls: boolean;
  fromName: string;
  fromEmail: string;
};

export type SendEmailInput = {
  settings: EmailSettingsDto;
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  attemptedAt: string;
};

function buildTransport(settings: EmailSettingsDto) {
  const secure = settings.useTls && settings.smtpPort === 465;
  const options: SMTPTransport.Options = {
    host: settings.smtpHost.trim(),
    port: settings.smtpPort || 587,
    secure,
    auth:
      settings.smtpUser.trim().length > 0
        ? { user: settings.smtpUser.trim(), pass: settings.smtpPassword }
        : undefined,
    tls: settings.useTls ? { rejectUnauthorized: false } : undefined,
  };
  return nodemailer.createTransport(options);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const attemptedAt = new Date().toISOString();
  const { settings, to, subject, html, text } = input;

  if (!settings.smtpHost?.trim()) {
    return { ok: false, error: "SMTP host is not configured.", attemptedAt };
  }
  if (!settings.fromEmail?.trim()) {
    return { ok: false, error: "Sender email is not configured.", attemptedAt };
  }
  if (!to?.trim()) {
    return { ok: false, error: "Recipient email is required.", attemptedAt };
  }

  try {
    const transport = buildTransport(settings);
    const from = settings.fromName
      ? `"${settings.fromName.replace(/"/g, "")}" <${settings.fromEmail}>`
      : settings.fromEmail;

    const info = await transport.sendMail({
      from,
      to: to.trim(),
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, " "),
      encoding: "utf-8",
    });

    logger.info("Email sent", { to, subject, messageId: info.messageId });
    return { ok: true, messageId: info.messageId, attemptedAt };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error("Email send failed", { to, subject, error });
    return { ok: false, error, attemptedAt };
  }
}

export function buildTestEmailHtml(): string {
  return `<div style="font-family:system-ui,sans-serif;padding:16px">
    <h2 style="margin:0 0 8px">Benben ERP</h2>
    <p>Your SMTP settings are working. You can send invoices and statements from Benben.</p>
  </div>`;
}

export async function verifySmtpConnection(settings: EmailSettingsDto): Promise<SendEmailResult> {
  const attemptedAt = new Date().toISOString();
  if (!settings.smtpHost?.trim()) {
    return { ok: false, error: "SMTP host is not configured.", attemptedAt };
  }
  try {
    const transport = buildTransport(settings);
    await transport.verify();
    return { ok: true, attemptedAt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      attemptedAt,
    };
  }
}
