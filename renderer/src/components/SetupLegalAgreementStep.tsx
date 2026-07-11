import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SetupLegalDocumentsBody } from "@/lib/legal-document-content";
import { COMPANY_LEGAL_NAME } from "@/lib/legal-contact";

const BODY_FONT = '"Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif';

type Props = {
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
  onContinue: () => void;
};

export function SetupLegalAgreementStep({ agreed, onAgreedChange, onContinue }: Props) {
  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-brand">
        <FileText className="h-4 w-4" />
        <h1 className="text-lg font-semibold">Step 1: Legal Agreement</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Review the Terms of Service, Privacy Policy, and Cancellation &amp; Refund Policy before
        creating your workspace.
      </p>

      <div
        className="mt-4 max-h-[min(22rem,50vh)] overflow-y-auto rounded-md border border-[#1a1d24]/15 bg-[#f7f6f1] px-4 py-4 text-[#1a1d24] shadow-inner"
        style={{ fontFamily: BODY_FONT }}
      >
        <SetupLegalDocumentsBody />
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface px-3 py-3">
        <Checkbox
          id="setup-legal-agreement"
          checked={agreed}
          onCheckedChange={(value) => onAgreedChange(value === true)}
          className="mt-0.5"
        />
        <span className="text-sm leading-relaxed text-foreground">
          I agree to the{" "}
          <Link to="/terms" className="font-medium text-brand underline hover:text-brand/80">
            Terms of Service
          </Link>
          ,{" "}
          <Link to="/privacy" className="font-medium text-brand underline hover:text-brand/80">
            Privacy Policy
          </Link>
          , and{" "}
          <Link to="/refunds" className="font-medium text-brand underline hover:text-brand/80">
            Cancellation &amp; Refund Policy
          </Link>{" "}
          of Benben ERP by {COMPANY_LEGAL_NAME}.
        </span>
      </label>

      <button
        type="button"
        onClick={onContinue}
        disabled={!agreed}
        className="mt-4 h-10 w-full rounded-md bg-slate-ink text-sm font-medium text-slate-ink-fg transition hover:bg-slate-ink-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        I Agree &amp; Continue
      </button>
    </>
  );
}
