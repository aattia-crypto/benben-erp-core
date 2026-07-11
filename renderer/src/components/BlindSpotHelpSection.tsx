import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Panel } from "@/components/ui-bits";

/** Inline user guide for the Tribal Knowledge Vault admin screen. */
export function BlindSpotHelpSection() {
  return (
    <Panel title="How to Use the Vault" padded={false}>
      <Accordion type="single" collapsible defaultValue="guide" className="px-4">
        <AccordionItem value="guide" className="border-none">
          <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
            Tribal knowledge alerts — where they appear
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-4 text-sm text-muted-foreground">
            <p>
              Entries you save here are stored in your organization&apos;s <strong>Blind-Spot Ledger</strong>. When
              operators work in downstream screens, matching guidance surfaces automatically as amber alert cards —
              no console or developer tools required.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Manufacturing → batch material consumption</strong> — when a production batch uses a material
                SKU that has a vault entry (or a global entry), critical-severity notes appear above the consumption
                editor so planners see machine limits and operational quirks before posting usage.
              </li>
              <li>
                <strong>Sales → new quote</strong> — when you select a CRM customer and/or line-item SKUs that match
                vault bindings, the same amber cards appear above the quote line editor so sales sees client
                preferences and delivery constraints while pricing.
              </li>
            </ul>
            <p>
              Use <strong>Critical</strong> severity for issues that must block bad decisions (shown in those alert
              cards). <strong>Warning</strong> and <strong>Optimization</strong> are recorded for reference in this
              vault table but do not trigger the inline amber banners.
            </p>
            <p>
              Bind entries <strong>globally</strong> for org-wide tribal knowledge, to an <strong>inventory SKU</strong>{" "}
              for material-specific notes, or to a <strong>CRM customer</strong> for account-specific preferences.
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="media">
          <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
            Media video feature — shop-floor clips on SKUs
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-4 text-sm text-muted-foreground">
            <p>
              Skip long write-ups when a quick visual is faster. In <strong>Add Vault Entry</strong>, drag a video file
              (MP4, WebM, MOV) onto the drop zone or use <strong>browse files</strong>. Give the clip a short title,
              pick the target SKU or customer, and save — no lengthy text body required.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Videos are copied to this machine&apos;s app data folder under{" "}
                <code className="text-xs">local-media/blindspots/</code> and stay available offline.
              </li>
              <li>
                Bind a clip to an <strong>inventory SKU</strong> so operators see an inline player in Manufacturing when
                that material is consumed, and in Sales when that SKU is on a quote line.
              </li>
              <li>
                Use <strong>Critical</strong> severity so video tips appear in the amber alert cards; the vault table
                always shows a playable preview for every video entry.
              </li>
            </ul>
            <p>
              Optional <strong>voice transcript</strong> text can be stored alongside a clip for search and accessibility;
              it surfaces under the player when present.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Panel>
  );
}
