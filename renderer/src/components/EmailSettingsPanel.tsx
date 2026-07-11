import { useState } from "react";
import { toast } from "sonner";
import { Panel, erp, ErpFieldLabel } from "@/components/ui-bits";
import { getEmailSettings, updateEmailSettings, type EmailSettings } from "@/lib/org-profile";
import { desktopTestEmail, desktopVerifySmtp } from "@/lib/desktop-email";
import { getSession } from "@/lib/auth-store";

export function EmailSettingsPanel() {
  const [settings, setSettings] = useState<EmailSettings>(getEmailSettings);
  const [testTo, setTestTo] = useState(getSession()?.username ?? "");
  const [busy, setBusy] = useState(false);

  function save() {
    updateEmailSettings(settings);
    toast.success("Email settings saved.");
  }

  async function testEmail() {
    if (!settings.smtpHost || !settings.fromEmail) {
      toast.error("Enter SMTP host and sender email first.");
      return;
    }
    if (!testTo.trim()) {
      toast.error("Enter a recipient for the test email.");
      return;
    }
    setBusy(true);
    const res = await desktopTestEmail(testTo.trim());
    setBusy(false);
    if (res.ok) toast.success(`Test email sent. Message ID: ${res.messageId ?? "ok"}`);
    else toast.error(res.error ?? "Test email failed.");
  }

  async function verifyConnection() {
    setBusy(true);
    const res = await desktopVerifySmtp();
    setBusy(false);
    if (res.ok) toast.success("SMTP connection verified.");
    else toast.error(res.error ?? "Connection failed.");
  }

  return (
    <Panel title="Email (SMTP)">
      <p className="mb-4 text-sm text-muted-foreground">
        Send invoices, statements, and CRM reminders from Benben. Marketing campaigns are not enabled.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <ErpFieldLabel>SMTP host</ErpFieldLabel>
          <input className={`mt-1 ${erp.input}`} value={settings.smtpHost} onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })} placeholder="smtp.example.com" />
        </label>
        <label className="block">
          <ErpFieldLabel>Port</ErpFieldLabel>
          <input type="number" className={`mt-1 ${erp.input}`} value={settings.smtpPort} onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })} />
        </label>
        <label className="block">
          <ErpFieldLabel>Username</ErpFieldLabel>
          <input className={`mt-1 ${erp.input}`} value={settings.smtpUser} onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })} />
        </label>
        <label className="block">
          <ErpFieldLabel>Password</ErpFieldLabel>
          <input type="password" className={`mt-1 ${erp.input}`} value={settings.smtpPassword} onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })} />
        </label>
        <label className="block">
          <ErpFieldLabel>From name</ErpFieldLabel>
          <input className={`mt-1 ${erp.input}`} value={settings.fromName} onChange={(e) => setSettings({ ...settings, fromName: e.target.value })} />
        </label>
        <label className="block">
          <ErpFieldLabel>From email</ErpFieldLabel>
          <input type="email" className={`mt-1 ${erp.input}`} value={settings.fromEmail} onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })} />
        </label>
        <label className="block sm:col-span-2">
          <ErpFieldLabel>Test recipient</ErpFieldLabel>
          <input type="email" className={`mt-1 ${erp.input}`} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={settings.useTls} onChange={(e) => setSettings({ ...settings, useTls: e.target.checked })} />
        Use TLS
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={erp.actionBtn} onClick={save} disabled={busy}>
          Save email settings
        </button>
        <button type="button" className={erp.secondaryBtn} onClick={() => void verifyConnection()} disabled={busy}>
          Verify connection
        </button>
        <button type="button" className={erp.secondaryBtn} onClick={() => void testEmail()} disabled={busy}>
          Send test email
        </button>
      </div>
    </Panel>
  );
}
