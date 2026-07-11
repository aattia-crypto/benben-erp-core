import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentLayout } from "@/components/LegalDocumentLayout";
import { COMPANY_LEGAL_NAME, DATA_STAYS_LOCAL_STATEMENT } from "@/lib/legal-contact";
import { LEGAL_EFFECTIVE_DATE, PrivacyPolicyBody } from "@/lib/legal-document-content";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Benben ERP" },
      {
        name: "description",
        content:
          "Benben ERP privacy policy — local-first data storage, no business record collection, minimal operational telemetry.",
      },
      { property: "og:title", content: "Privacy Policy — Benben ERP" },
      {
        property: "og:description",
        content: DATA_STAYS_LOCAL_STATEMENT,
      },
      { property: "og:url", content: "/privacy" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
});

const SECTIONS = [
  { id: "local-storage", label: "1. Local-Only Data Storage" },
  { id: "no-transmission", label: "2. Your Data Never Leaves Your Machine" },
  { id: "not-collected", label: "3. What We Do Not Collect" },
  { id: "telemetry", label: "4. Minimal Operational Telemetry" },
  { id: "backups", label: "5. Backups Are Your Responsibility" },
  { id: "contact", label: "6. Contact" },
];

function PrivacyPage() {
  return (
    <LegalDocumentLayout
      title="Privacy Policy"
      subtitle={
        <>
          This Privacy Policy describes how <strong>Benben ERP</strong>, published by{" "}
          <strong>{COMPANY_LEGAL_NAME}</strong>, handles information when you install and use the
          Software on your own hardware.
        </>
      }
      effectiveLabel="Last updated"
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      toc={SECTIONS}
    >
      <PrivacyPolicyBody />
    </LegalDocumentLayout>
  );
}
