import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel, fmtMoney, erp, ErpFieldLabel } from "@/components/ui-bits";
import { getSession } from "@/lib/auth-store";
import { getEntities, subscribeCrm } from "@/lib/crm-store";
import {
  createOpportunity,
  getOpportunities,
  getPipelineForecast,
  moveOpportunityStage,
  type PipelineStage,
} from "@/lib/crm-pipeline-store";

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: "lead", label: "Lead" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "negotiation", label: "Negotiation" },
  { id: "closed_won", label: "Won" },
  { id: "closed_lost", label: "Lost" },
];

function accountOptions() {
  return getEntities().filter((e) => e.kind === "client" || e.kind === "both");
}

function resolveOwner(): string {
  const session = getSession();
  return session?.name?.trim() || session?.username?.trim() || "";
}

type Props = {
  /** Pre-selected CRM account from directory view */
  defaultEntityId?: string;
  onMoved?: () => void;
};

export function CrmPipelineBoard({ defaultEntityId, onMoved }: Props) {
  const [entityId, setEntityId] = useState(defaultEntityId ?? "");
  const [title, setTitle] = useState("");
  const [revenue, setRevenue] = useState(10000);
  const [probability, setProbability] = useState(20);
  const [, tick] = useState(0);

  const accounts = accountOptions();
  const forecast = getPipelineForecast();
  const opps = getOpportunities(entityId || undefined);
  const selectedAccount = accounts.find((a) => a.id === entityId);
  const owner = resolveOwner();

  useEffect(() => subscribeCrm(() => tick((n) => n + 1)), []);

  useEffect(() => {
    if (defaultEntityId) setEntityId(defaultEntityId);
  }, [defaultEntityId]);

  function validateNewOpp(): string | null {
    if (!entityId) return "Select a customer account from CRM.";
    if (!selectedAccount) return "Selected account is no longer in CRM.";
    if (!title.trim()) return "Enter an opportunity title.";
    if (!owner) return "Sign in to assign an opportunity owner.";
    if (revenue <= 0) return "Expected revenue must be greater than zero.";
    if (probability < 0 || probability > 100) return "Probability must be between 0 and 100.";
    return null;
  }

  function addOpp() {
    const err = validateNewOpp();
    if (err) {
      toast.error(err);
      return;
    }
    createOpportunity({
      entityId,
      title: title.trim(),
      stage: "lead",
      probability,
      expectedCloseDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      expectedRevenue: revenue,
      owner,
    });
    setTitle("");
    toast.success("Opportunity created.");
    onMoved?.();
  }

  async function handleDrop(oppId: string, stage: PipelineStage) {
    try {
      await moveOpportunityStage(oppId, stage);
      onMoved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stage update failed.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-md border border-border p-3 text-sm">
          <div className="text-muted-foreground">Pipeline total</div>
          <div className={`text-lg font-semibold ${erp.financial}`}>{fmtMoney(forecast.total)}</div>
        </div>
        <div className="rounded-md border border-border p-3 text-sm">
          <div className="text-muted-foreground">Weighted forecast</div>
          <div className={`text-lg font-semibold ${erp.financial}`}>{fmtMoney(forecast.weighted)}</div>
        </div>
      </div>

      <Panel title="New opportunity">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Customer account (CRM)</ErpFieldLabel>
            <select
              className={`mt-1 ${erp.input}`}
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.code})
                </option>
              ))}
            </select>
            {accounts.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Create a client in CRM → Directory before adding pipeline opportunities.
              </p>
            ) : null}
          </label>
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Title</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              placeholder="Opportunity title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block">
            <ErpFieldLabel>Expected revenue</ErpFieldLabel>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`mt-1 ${erp.input} ${erp.financial}`}
              value={revenue}
              onChange={(e) => setRevenue(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <ErpFieldLabel>Probability %</ErpFieldLabel>
            <input
              type="number"
              min={0}
              max={100}
              className={`mt-1 ${erp.input}`}
              value={probability}
              onChange={(e) => setProbability(Number(e.target.value))}
            />
          </label>
          <div className="sm:col-span-2 text-xs text-muted-foreground">
            Owner: {owner || "— sign in required —"}
          </div>
        </div>
        <button
          type="button"
          className={`mt-3 ${erp.actionBtn}`}
          onClick={addOpp}
          disabled={!!validateNewOpp()}
        >
          Add opportunity
        </button>
      </Panel>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const cards = opps.filter((o) => o.stage === stage.id);
          return (
            <div key={stage.id} className="min-w-[200px] flex-1 rounded-md border border-border bg-surface/40 p-2">
              <ErpFieldLabel>{stage.label}</ErpFieldLabel>
              <ul className="mt-2 space-y-2">
                {cards.map((o) => {
                  const account = accounts.find((a) => a.id === o.entityId);
                  return (
                    <li
                      key={o.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("oppId", o.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("oppId");
                        if (id) void handleDrop(id, stage.id);
                      }}
                      className="cursor-grab rounded border border-border bg-card p-2 text-xs shadow-sm"
                    >
                      <div className="font-medium">{o.title}</div>
                      <div className="text-muted-foreground">{account?.name ?? o.entityId}</div>
                      <div className={erp.financial}>{fmtMoney(o.expectedRevenue)}</div>
                      <div className="text-muted-foreground">
                        {o.probability}% · {o.expectedCloseDate} · {o.owner}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
