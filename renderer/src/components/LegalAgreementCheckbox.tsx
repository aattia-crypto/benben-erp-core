import { Link } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { COMPANY_LEGAL_NAME } from "@/lib/legal-contact";

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
};

/** Required Paddle / ToS acceptance — exact label text must not change without legal review. */
export function LegalAgreementCheckbox({ checked, onCheckedChange, className }: Props) {
  return (
    <div className={className}>
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          id="legal-agreement"
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className="mt-0.5"
        />
        <span className="text-sm leading-relaxed">
          I agree to the{" "}
          <Link to="/terms" className="font-medium text-emerald-600 underline hover:text-emerald-700">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="font-medium text-emerald-600 underline hover:text-emerald-700">
            Privacy Policy
          </Link>{" "}
          of Benben ERP by {COMPANY_LEGAL_NAME}.
        </span>
      </label>
    </div>
  );
}
