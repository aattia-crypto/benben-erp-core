import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, StatCard, KpiGrid, fmtMoney, erp, ErpFieldLabel } from "@/components/ui-bits";
import { ExportToolbar } from "@/components/ExportToolbar";
import { CrmPipelineBoard } from "@/components/CrmPipelineBoard";
import {
  addActivity,
  addReminder,
  createEntity,
  getActivities,
  getEntities,
  getReminders,
  subscribeCrm,
  type EntityKind,
} from "@/lib/crm-store";
import "@/lib/crm-automation";
import { buildCustomerTimeline } from "@/lib/crm-timeline";
import { desktopSendEmail } from "@/lib/desktop-email";
import { crmReminderEmailHtml } from "@/lib/email-templates";
import { getCrmTasks, getPipelineForecast, subscribePipeline } from "@/lib/crm-pipeline-store";

export const Route = createFileRoute("/crm")({
  head: () => ({
    meta: [
      { title: "CRM — Benben ERP" },
      { name: "description", content: "Clients, vendors, activities, notes, and reminders." },
    ],
  }),
  component: CRM,
});

const filters = ["all", "client", "vendor", "both"] as const;

const crmTabs = ["directory", "pipeline", "dashboard"] as const;

function CRM() {
  const [view, setView] = useState<(typeof crmTabs)[number]>("directory");
  const [f, setF] = useState<(typeof filters)[number]>("all");
  const [q, setQ] = useState("");
  const [, tick] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", kind: "client" as EntityKind, country: "USA", contact: "" });
  const [note, setNote] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDue, setReminderDue] = useState("");

  useEffect(() => {
    const u1 = subscribeCrm(() => tick((n) => n + 1));
    const u2 = subscribePipeline(() => tick((n) => n + 1));
    return () => {
      u1();
      u2();
    };
  }, []);

  const entities = getEntities();
  const rows = entities.filter(
    (e) => (f === "all" || e.kind === f) && (e.name.toLowerCase().includes(q.toLowerCase()) || e.code.includes(q)),
  );
  const selected = entities.find((e) => e.id === selectedId) ?? rows[0] ?? null;

  function saveEntity() {
    if (!form.name.trim() || !form.contact.trim()) {
      toast.error("Name and contact are required.");
      return;
    }
    const e = createEntity(form);
    setSelectedId(e.id);
    setShowNew(false);
    toast.success(`Entity ${e.code} created.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM · Clients & Vendors"
        subtitle="Directory, activity tracking, notes, reminders, and communication history."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportToolbar
              filenameBase="crm-entities"
              columns={[
                { key: "code", label: "Code" },
                { key: "name", label: "Name" },
                { key: "kind", label: "Role" },
                { key: "country", label: "Country" },
                { key: "ytdValue", label: "YTD", align: "right", format: (v) => fmtMoney(Number(v)) },
              ]}
              rows={rows.map((e) => ({ ...e }))}
              meta={{ title: "CRM Entities", filters: f !== "all" ? `Role: ${f}` : q ? `Search: ${q}` : undefined }}
            />
            <button type="button" className={erp.actionBtn} onClick={() => setShowNew(true)}>
              + New Entry
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {crmTabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setView(t)}
            className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
              view === t ? "bg-erp-action text-erp-action-fg" : "border border-border bg-card text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {view === "pipeline" && (
        <CrmPipelineBoard defaultEntityId={selected?.id} onMoved={() => tick((n) => n + 1)} />
      )}

      {view === "dashboard" && (
        <KpiGrid columns={4}>
          <StatCard accent="revenue" label="Weighted forecast" value={fmtMoney(getPipelineForecast().weighted)} />
          <StatCard accent="operational" label="Pipeline" value={getPipelineForecast().total > 0 ? "Active" : "—"} />
          <StatCard
            accent="financial"
            label="Overdue tasks"
            value={String(getCrmTasks().filter((t) => !t.completed && t.dueAt < new Date().toISOString()).length)}
          />
          <StatCard accent="neutral" label="Recent activities" value={String(getActivities().slice(0, 5).length)} />
        </KpiGrid>
      )}

      {view === "directory" && (
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-md border border-border bg-card p-0.5">
              {filters.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setF(t)}
                  className={`rounded px-3 py-1 text-xs font-medium capitalize ${
                    f === t ? "bg-erp-action text-erp-action-fg" : "text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              className={`${erp.input} max-w-xs`}
              placeholder="Filter…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <Panel padded={false}>
            <table className="w-full text-sm">
              <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-right">YTD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className={`cursor-pointer border-t border-border hover:bg-surface/60 ${
                      selected?.id === e.id ? "bg-brand/5" : ""
                    }`}
                    onClick={() => setSelectedId(e.id)}
                  >
                    <td className="px-4 py-2 font-mono text-xs">{e.code}</td>
                    <td className="px-4 py-2 font-medium">{e.name}</td>
                    <td className="px-4 py-2">
                      <Pill tone="brand">{e.kind}</Pill>
                    </td>
                    <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(e.ytdValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        {selected && (
          <Panel title={selected.name}>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>{selected.contact}</div>
              {selected.phone ? <div>Phone: {selected.phone}</div> : null}
              {selected.address ? <div>{selected.address}</div> : null}
              {selected.taxId ? <div>Tax ID: {selected.taxId}</div> : null}
              {selected.paymentTerms ? <div>Terms: {selected.paymentTerms}</div> : null}
              <div>
                {selected.code} · {selected.country} · {selected.kind}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <ErpFieldLabel>Add note / activity</ErpFieldLabel>
                <textarea className={`mt-1 min-h-[60px] ${erp.input}`} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button
                type="button"
                className={erp.actionBtn}
                onClick={() => {
                  if (!note.trim()) return toast.error("Enter a note.");
                  addActivity(selected.id, "note", "Note", note);
                  setNote("");
                  toast.success("Activity logged.");
                }}
              >
                Save note
              </button>
              <label className="block">
                <ErpFieldLabel>Reminder</ErpFieldLabel>
                <input className={`mt-1 ${erp.input}`} placeholder="Title" value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} />
                <input type="datetime-local" className={`mt-1 ${erp.input}`} value={reminderDue} onChange={(e) => setReminderDue(e.target.value)} />
              </label>
              <button
                type="button"
                className={erp.secondaryBtn}
                onClick={() => {
                  if (!reminderTitle || !reminderDue) return toast.error("Title and due date required.");
                  addReminder(selected.id, reminderTitle, reminderDue);
                  setReminderTitle("");
                  toast.success("Reminder set.");
                }}
              >
                Add reminder
              </button>
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <ErpFieldLabel>Unified timeline</ErpFieldLabel>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {buildCustomerTimeline(selected.id, selected.code).map((item) => (
                  <li key={item.id}>
                    <span className="font-medium text-foreground">{item.kind}</span> {item.title} —{" "}
                    {new Date(item.at).toLocaleString()}
                    <div>{item.body}</div>
                  </li>
                ))}
              </ul>
              <ErpFieldLabel>Activity history</ErpFieldLabel>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {getActivities(selected.id).map((a) => (
                  <li key={a.id}>
                    {a.type}: {a.subject} — {new Date(a.at).toLocaleString()}
                  </li>
                ))}
              </ul>
              <ErpFieldLabel>Reminders</ErpFieldLabel>
              <ul className="mt-2 text-xs">
                {getReminders(selected.id).map((r) => (
                  <li key={r.id} className={`flex justify-between gap-2 ${r.completed ? "line-through text-muted-foreground" : erp.warning}`}>
                    <span>
                      {r.title} · {r.dueAt}
                    </span>
                    {!r.completed && (
                      <button
                        type="button"
                        className="shrink-0 text-xs text-brand hover:underline"
                        onClick={async () => {
                          const to = window.prompt(`Email reminder to (${selected.name}):`);
                          if (!to?.trim()) return;
                          const res = await desktopSendEmail({
                            to: to.trim(),
                            subject: `Reminder: ${r.title}`,
                            html: crmReminderEmailHtml({
                              contactName: selected.name,
                              subject: r.title,
                              dueAt: r.dueAt,
                            }),
                          });
                          if (res.ok) toast.success("Reminder sent.");
                          else toast.error(res.error ?? "Email failed.");
                        }}
                      >
                        Email
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        )}
      </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5">
            <h3 className="font-semibold">New CRM entry</h3>
            <div className="mt-4 space-y-3">
              <input className={erp.input} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select className={erp.input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as EntityKind })}>
                <option value="client">Client</option>
                <option value="vendor">Vendor</option>
                <option value="both">Both</option>
              </select>
              <input className={erp.input} placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              <input className={erp.input} placeholder="Contact email" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={erp.secondaryBtn} onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button type="button" className={erp.actionBtn} onClick={saveEntity}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
