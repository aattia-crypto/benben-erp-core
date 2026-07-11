import { Link } from "@tanstack/react-router";
import {
  COMPANY_LEGAL_NAME,
  COMPANY_SHORT_NAME,
  DATA_STAYS_LOCAL_STATEMENT,
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTACT_MAILTO,
} from "@/lib/legal-contact";
import { LegalCallout, LegalSection } from "@/components/LegalDocumentLayout";

export const LEGAL_EFFECTIVE_DATE = "May 14, 2026";

type BodyProps = { compact?: boolean };

export function TermsOfServiceBody({ compact }: BodyProps) {
  return (
    <>
      <LegalSection compact={compact} id="license-grant" title="1. License Grant (Single-Workstation)">
        <p>
          Subject to the Licensee&rsquo;s continued compliance with this Agreement, {COMPANY_LEGAL_NAME}{" "}
          grants the Licensee a{" "}
          <strong>
            limited, non-exclusive, non-transferable, non-sublicensable single-workstation license
          </strong>{" "}
          to install and use one (1) instance of the Software on a single primary workstation owned
          or controlled by the Licensee.
        </p>
        <p>
          The license is issued per named user. The Licensee may not share license keys, host the
          Software on a multi-tenant terminal server, or permit concurrent use by additional
          individuals without obtaining a separate license from {COMPANY_SHORT_NAME}. Reverse
          engineering, decompilation, or redistribution of the Software, in whole or in part, is
          strictly prohibited except to the limited extent expressly permitted by applicable law.
        </p>
        <p>
          All right, title, and interest in and to the Software, including all intellectual property
          rights, remain the exclusive property of {COMPANY_LEGAL_NAME}.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="data-privacy" title="2. Local-First Architecture & Data Privacy">
        <p>
          Benben ERP is a <strong>local-first</strong> application. Business records created or
          processed by the Licensee &mdash; including, without limitation, accounting ledgers,
          inventory data, manufacturing batches, customer and vendor records, and point-of-sale
          transactions &mdash; are stored locally on the Licensee&rsquo;s device or on
          infrastructure designated by the Licensee.
        </p>
        <p>
          <strong>{DATA_STAYS_LOCAL_STATEMENT}</strong> We do not host, replicate, mine, sell, or
          otherwise process the Licensee&rsquo;s business data. We do not operate a cloud database for
          customer business records, and we do not receive copies of such data through ordinary use
          of the Software. The Licensee is the sole controller of all business data generated within
          Benben ERP.
        </p>
        <p>
          Limited operational telemetry &mdash; such as license activation status, application
          version, and anonymous crash diagnostics &mdash; may be transmitted to {COMPANY_LEGAL_NAME}{" "}
          solely to maintain and improve the Software. No business records are transmitted as part of
          this telemetry.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="limitation-of-liability" title="3. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, the Software is provided &ldquo;
          <strong>AS IS</strong>&rdquo; and &ldquo;<strong>AS AVAILABLE</strong>,&rdquo; without
          warranties of any kind, whether express, implied, statutory, or otherwise, including
          without limitation any implied warranties of merchantability, fitness for a particular
          purpose, accuracy, or non-infringement.
        </p>
        <p>
          In no event shall {COMPANY_LEGAL_NAME}, its officers, employees, contractors, or affiliates
          be liable for any{" "}
          <strong>
            loss of data, loss of profits, business interruption, operational downtime, regulatory
            penalties, or any indirect, incidental, special, consequential, or punitive damages
          </strong>{" "}
          arising out of or in connection with the use or inability to use the Software, even if we
          have been advised of the possibility of such damages.
        </p>
        <p>
          The Licensee acknowledges that Benben ERP runs on Licensee-controlled hardware and that{" "}
          {COMPANY_LEGAL_NAME} has no operational visibility into, or control over, that environment.
          The aggregate liability of {COMPANY_LEGAL_NAME} arising under this Agreement shall not
          exceed the amount actually paid by the Licensee for the applicable license during the{" "}
          <strong>twelve (12) months</strong> preceding the event giving rise to the claim.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="local-backup" title="4. Local Backup Responsibility">
        <p>
          Because Benben ERP stores all business data on Licensee-controlled infrastructure, the
          Licensee is{" "}
          <strong>solely responsible for establishing, monitoring, and verifying</strong> backup
          procedures appropriate to its business. This includes configuring the Software&rsquo;s
          built-in backup engine to write to a local drive, network share, or private cloud
          destination of the Licensee&rsquo;s choosing.
        </p>
        <p>
          The Licensee shall periodically verify that backup snapshots are being produced, are
          readable, and can be successfully restored. {COMPANY_LEGAL_NAME} does not retain copies of
          Licensee backups and is unable to recover data that has been lost, corrupted, encrypted by
          malware, deleted, or rendered inaccessible due to hardware failure, user error, theft, or
          environmental damage.
        </p>
        <p>
          The Licensee is encouraged to maintain at least one off-site or off-device copy of all
          business-critical snapshots and to test restoration procedures on a regular schedule.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="general" title="5. General Provisions">
        <p>
          This Agreement constitutes the entire agreement between the Licensee and {COMPANY_LEGAL_NAME}{" "}
          with respect to the Software and supersedes all prior or contemporaneous communications. If
          any provision of this Agreement is held to be unenforceable, the remaining provisions shall
          remain in full force and effect.
        </p>
        <p>
          {COMPANY_LEGAL_NAME} may update this Agreement from time to time. Material changes will be
          communicated through the Software or through published release notes. Continued use of the
          Software following such changes constitutes acceptance of the revised Agreement.
        </p>
        <p>
          For questions regarding these Terms, contact {COMPANY_LEGAL_NAME} at{" "}
          <a href={LEGAL_CONTACT_MAILTO} className="text-emerald-700 underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}

export function PrivacyPolicyBody({ compact }: BodyProps) {
  return (
    <>
      <LegalCallout compact={compact}>
        <p className="leading-relaxed">
          <strong className="font-semibold">{DATA_STAYS_LOCAL_STATEMENT}</strong>
        </p>
      </LegalCallout>

      <LegalSection compact={compact} id="local-storage" title="1. Local-Only Data Storage">
        <p>
          Benben ERP is a <strong>local-first</strong> desktop application. Every business record the
          Software creates or processes &mdash; including production batches, bills of materials,
          inventory movements, general-ledger entries, accounts receivable and payable, customer and
          vendor records, point-of-sale transactions, and audit logs &mdash; is stored in an embedded
          database on the computer or on-premise server where you install the application.
        </p>
        <p>
          {COMPANY_LEGAL_NAME} does not operate cloud storage for your ERP data. There is no remote
          sync of business records, no background upload of operational data, and no hosted copy of
          your ledgers. If your machine is offline, Benben continues to function normally.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="no-transmission" title="2. Your Data Never Leaves Your Machine">
        <p>
          <strong>{DATA_STAYS_LOCAL_STATEMENT}</strong> We cannot read, copy, analyze, sell, or share
          your operational data because it is never transmitted to us through ordinary use of the
          Software.
        </p>
        <p>
          You remain the sole controller of all business data generated within Benben ERP. Optional
          backup destinations you configure (local drive, network share, or private cloud account you
          own) are chosen and controlled by you; {COMPANY_LEGAL_NAME} does not receive the contents of
          those backups.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="not-collected" title="3. What We Do Not Collect">
        <p>Benben ERP does not collect:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Customer, vendor, or employee records</li>
          <li>Sales figures, pricing, margins, or financial statements</li>
          <li>Production data, bills of materials, or trade secrets</li>
          <li>Payroll or human-resources information</li>
          <li>Usage analytics tied to your business operations</li>
        </ul>
      </LegalSection>

      <LegalSection compact={compact} id="telemetry" title="4. Minimal Operational Telemetry">
        <p>
          To authorize your license and keep the Software secure and up to date, Benben may transmit
          a <strong>minimal set of operational signals</strong> to {COMPANY_LEGAL_NAME}. This
          telemetry is strictly limited to:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>License activation status and license key validation</li>
          <li>Application version and build identifier</li>
          <li>Operating-system identifier sufficient to deliver compatible updates</li>
          <li>Anonymous crash diagnostics to improve stability (no business record payloads)</li>
        </ul>
        <p>
          <strong>
            No business records, database contents, or backup files are included in this telemetry.
          </strong>{" "}
          Operational signals are never linked to your ledgers, customers, vendors, or production
          data.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="backups" title="5. Backups Are Your Responsibility">
        <p>
          Because your data lives on hardware you control, you are solely responsible for configuring,
          monitoring, and verifying backups to a destination you trust. Benben provides built-in
          backup tooling, but {COMPANY_LEGAL_NAME} never receives or stores backup contents on Benben
          infrastructure.
        </p>
        <p>
          We recommend maintaining at least one off-device copy of business-critical snapshots and
          testing restoration on a regular schedule.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="contact" title="6. Contact">
        <p>
          For privacy questions, contact {COMPANY_LEGAL_NAME} at{" "}
          <a href={LEGAL_CONTACT_MAILTO} className="text-emerald-700 underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}

export function RefundPolicyBody({ compact }: BodyProps) {
  return (
    <>
      <LegalSection compact={compact} id="overview" title="1. Overview">
        <p>
          Benben ERP is licensed on a subscription basis. This Cancellation &amp; Refund Policy
          supplements our{" "}
          {compact ? (
            <>Terms of Service and Privacy Policy</>
          ) : (
            <>
              <Link to="/terms" className="text-emerald-700 underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-emerald-700 underline">
                Privacy Policy
              </Link>
            </>
          )}
          . By purchasing or renewing a subscription, you agree to the practices described here.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="merchant-of-record" title="2. Merchant of Record (Paddle)">
        <p>
          Subscription payments, invoices, tax collection, and payment-method management for Benben
          ERP are handled by our <strong>Merchant of Record</strong>,{" "}
          <strong>Paddle.com Market Limited</strong> (&ldquo;Paddle&rdquo;). Paddle appears on your
          card or bank statement as the billing entity for your subscription.
        </p>
        <p>
          To update your payment method, view invoices, or manage your subscription portal, use the
          receipt or account link provided by Paddle at the time of purchase, or contact us at{" "}
          <a href={LEGAL_CONTACT_MAILTO} className="text-emerald-700 underline">
            {LEGAL_CONTACT_EMAIL}
          </a>{" "}
          and we will direct you to the correct Paddle self-service page.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="cancellations" title="3. Cancellations">
        <p>
          You may cancel your Benben ERP subscription at any time through your Paddle customer portal
          or by contacting {COMPANY_LEGAL_NAME}.{" "}
          <strong>Cancellations take effect at the end of the current billing cycle.</strong> You
          will retain access to the Software through the end of the paid period; no further charges
          will be made unless you re-subscribe.
        </p>
        <p>
          Canceling a subscription does not delete data stored locally on your device. You remain
          responsible for exporting or backing up your business records before uninstalling the
          application.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="refunds" title="4. Refunds & Technical Exception">
        <p>
          Except as required by applicable consumer-protection law, subscription fees are generally{" "}
          <strong>non-refundable</strong> once a billing period has begun. Because Benben ERP is
          local-first software installed on your own hardware, we do not offer blanket
          &ldquo;change of mind&rdquo; refunds after successful delivery and activation.
        </p>
        <p>
          <strong>14-day technical exception:</strong> If a catastrophic local desktop environment
          collision prevents you from deploying Benben ERP on your primary workstation &mdash; for
          example, an unresolvable conflict with embedded PostgreSQL, licensing, or first-run
          bootstrap &mdash; and our Benben Support team cannot resolve the issue within{" "}
          <strong>fourteen (14) days</strong> of your initial purchase, you may request a refund
          review by contacting{" "}
          <a href={LEGAL_CONTACT_MAILTO} className="text-emerald-700 underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Refund decisions under this exception are made at {COMPANY_LEGAL_NAME}&rsquo;s discretion
          in coordination with Paddle&rsquo;s refund procedures.
        </p>
        <p>
          To qualify for review, you must provide your Paddle order reference, machine fingerprint
          from the activation screen, and a brief description of the blocking error. Refunds approved
          under this exception are processed back to your original payment method via Paddle.
        </p>
      </LegalSection>

      <LegalSection compact={compact} id="refund-contact" title="5. Contact">
        <p>
          For cancellation assistance, refund inquiries, or billing questions, contact{" "}
          {COMPANY_LEGAL_NAME} at{" "}
          <a href={LEGAL_CONTACT_MAILTO} className="text-emerald-700 underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}

/** Combined scrollable body for setup wizard — Terms, Privacy, then Refunds. */
export function SetupLegalDocumentsBody() {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 border-b border-[#1a1d24]/10 pb-2 text-base font-semibold text-[#0f1b2d]">
          Terms of Service
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-[#1a1d24]/70">
          Effective date: {LEGAL_EFFECTIVE_DATE}. By installing or using Benben ERP, you agree to
          these Terms published by {COMPANY_LEGAL_NAME}.
        </p>
        <TermsOfServiceBody compact />
      </div>
      <div>
        <h3 className="mb-3 border-b border-[#1a1d24]/10 pb-2 text-base font-semibold text-[#0f1b2d]">
          Privacy Policy
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-[#1a1d24]/70">
          Last updated: {LEGAL_EFFECTIVE_DATE}.
        </p>
        <PrivacyPolicyBody compact />
      </div>
      <div>
        <h3 className="mb-3 border-b border-[#1a1d24]/10 pb-2 text-base font-semibold text-[#0f1b2d]">
          Cancellation &amp; Refund Policy
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-[#1a1d24]/70">
          Last updated: {LEGAL_EFFECTIVE_DATE}.
        </p>
        <RefundPolicyBody compact />
      </div>
      <p className="text-center text-xs text-[#1a1d24]/55">
        Full documents:{" "}
        <Link to="/terms" className="text-emerald-700 underline">
          Terms
        </Link>
        {" · "}
        <Link to="/privacy" className="text-emerald-700 underline">
          Privacy
        </Link>
        {" · "}
        <Link to="/refunds" className="text-emerald-700 underline">
          Refunds
        </Link>
      </p>
    </div>
  );
}
