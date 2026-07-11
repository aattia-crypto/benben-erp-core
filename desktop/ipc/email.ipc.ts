import { ipcMain } from "electron";

import { IPC } from "../constants";
import * as emailService from "../services/email.service";

export function registerEmailIpc(): void {
  ipcMain.handle(IPC.email.send, async (_event, input: emailService.SendEmailInput) => {
    try {
      const r = await emailService.sendEmail(input);
      return { ok: r.ok, data: r, error: r.error };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    IPC.email.test,
    (_event, payload: { settings: emailService.EmailSettingsDto; to: string }) => {
      const { settings, to } = payload;
      return emailService
        .sendEmail({
          settings,
          to,
          subject: "Benben ERP — test email",
          html: emailService.buildTestEmailHtml(),
          text: "This is a test message from Benben ERP. SMTP is configured correctly.",
        })
        .then((r) => ({ ok: r.ok, data: r, error: r.error }));
    },
  );

  ipcMain.handle(IPC.email.verifyConnection, (_event, settings: emailService.EmailSettingsDto) => {
    return emailService.verifySmtpConnection(settings).then((r) => ({
      ok: r.ok,
      data: r,
      error: r.error,
    }));
  });
}
