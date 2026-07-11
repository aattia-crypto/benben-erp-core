import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentLayout } from "@/components/LegalDocumentLayout";
import { COMPANY_LEGAL_NAME } from "@/lib/legal-contact";
import { LEGAL_EFFECTIVE_DATE, RefundPolicyBody } from "@/lib/legal-document-content";

export const Route = createFileRoute("/refunds")({
  component: RefundsPage,
  head: () => ({
    meta: [
      { title: "Cancellation & Refund Policy — Benben ERP" },
      {
        name: "description",
        content:
          `Cancellation and refund policy for Benben ERP subscriptions managed by Paddle, published by ${COMPANY_LEGAL_NAME}.`,
      },
    ],
  }),
});

const SECTIONS = [
  { id: "overview", label: "1. Overview" },
  { id: "merchant-of-record", label: "2. Merchant of Record (Paddle)" },
  { id: "cancellations", label: "3. Cancellations" },
  { id: "refunds", label: "4. Refunds & Technical Exception" },
  { id: "refund-contact", label: "5. Contact" },
];

function RefundsPage() {
  return (
    <LegalDocumentLayout
      title="Cancellation & Refund Policy"
      subtitle={
        <>
          This policy describes how subscription billing, cancellations, and refunds work for{" "}
          <strong>Benben ERP</strong>, published by <strong>{COMPANY_LEGAL_NAME}</strong>.
        </>
      }
      effectiveLabel="Last updated"
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      toc={SECTIONS}
    >
      <RefundPolicyBody />
    </LegalDocumentLayout>
  );
}
