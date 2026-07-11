import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentLayout } from "@/components/LegalDocumentLayout";
import { COMPANY_LEGAL_NAME } from "@/lib/legal-contact";
import { LEGAL_EFFECTIVE_DATE, TermsOfServiceBody } from "@/lib/legal-document-content";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service — Benben ERP" },
      {
        name: "description",
        content:
          `Terms of Service for Benben ERP by ${COMPANY_LEGAL_NAME} — single-workstation license, local-first architecture, liability cap, and backup responsibilities.`,
      },
    ],
  }),
});

const SECTIONS = [
  { id: "license-grant", label: "1. License Grant (Single-Workstation)" },
  { id: "data-privacy", label: "2. Local-First Architecture & Data Privacy" },
  { id: "limitation-of-liability", label: "3. Limitation of Liability" },
  { id: "local-backup", label: "4. Local Backup Responsibility" },
  { id: "general", label: "5. General Provisions" },
];

function TermsPage() {
  return (
    <LegalDocumentLayout
      title="Terms of Service"
      subtitle={
        <>
          These Terms of Service (the &ldquo;Agreement&rdquo;) govern your use of Benben ERP (the
          &ldquo;Software&rdquo;), a desktop enterprise resource planning application published and
          licensed by <strong>{COMPANY_LEGAL_NAME}</strong> (&ldquo;Benben,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By installing, activating, or using the
          Software, you (&ldquo;Licensee&rdquo;) agree to be bound by this Agreement.
        </>
      }
      effectiveLabel="Effective date"
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      toc={SECTIONS}
    >
      <TermsOfServiceBody />
    </LegalDocumentLayout>
  );
}
