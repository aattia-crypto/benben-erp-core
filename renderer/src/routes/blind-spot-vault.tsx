import { createFileRoute } from "@tanstack/react-router";
import { BlindSpotAdmin } from "@/components/BlindSpotAdmin";

export const Route = createFileRoute("/blind-spot-vault")({
  head: () => ({
    meta: [
      { title: "Tribal Knowledge Vault — Benben ERP" },
      {
        name: "description",
        content: "Manage blind-spot ledger entries for manufacturing and sales contextual guidance.",
      },
    ],
  }),
  component: BlindSpotVaultPage,
});

function BlindSpotVaultPage() {
  return <BlindSpotAdmin />;
}
