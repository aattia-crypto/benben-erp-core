import { Link } from "@tanstack/react-router";
import { LEGAL_CONTACT_EMAIL, LEGAL_CONTACT_MAILTO, COMPANY_LEGAL_NAME, COPYRIGHT_FOOTER } from "@/lib/legal-contact";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export type LegalTocItem = { id: string; label: string };

type Props = {
  title: string;
  subtitle: string;
  effectiveLabel: string;
  effectiveDate: string;
  toc?: LegalTocItem[];
  children: React.ReactNode;
};

const UI_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const BODY_FONT = '"Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif';

export function LegalDocumentLayout({
  title,
  subtitle,
  effectiveLabel,
  effectiveDate,
  toc,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-[#f7f6f1] text-[#1a1d24]" style={{ fontFamily: BODY_FONT }}>
      <header className="sticky top-0 z-10 border-b border-[#1a1d24]/10 bg-[#0f1b2d] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/landing" className="flex items-center gap-2 text-sm text-white/80 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            <span style={{ fontFamily: UI_FONT }}>Back to Benben</span>
          </Link>
          <div
            className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/70"
            style={{ fontFamily: UI_FONT }}
          >
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            {COMPANY_LEGAL_NAME}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <div className="border-b border-[#1a1d24]/15 pb-8">
          <p
            className="text-xs uppercase tracking-[0.3em] text-[#1a1d24]/60"
            style={{ fontFamily: UI_FONT }}
          >
            Legal · Benben ERP
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">{title}</h1>
          <p className="mt-4 text-base leading-relaxed text-[#1a1d24]/75">{subtitle}</p>
          <p className="mt-3 text-sm text-[#1a1d24]/55" style={{ fontFamily: UI_FONT }}>
            {effectiveLabel}: {effectiveDate}
          </p>
        </div>

        {toc && toc.length > 0 && (
          <nav
            className="my-10 rounded-md border border-[#1a1d24]/15 bg-white px-5 py-4"
            style={{ fontFamily: UI_FONT }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1a1d24]/60">Contents</p>
            <ol className="mt-3 space-y-1.5 text-sm">
              {toc.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-[#0f1b2d] hover:text-emerald-700 hover:underline">
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <article className="space-y-12 text-[17px] leading-[1.8] text-[#1a1d24]/90">{children}</article>

        <footer
          className="mt-16 border-t border-[#1a1d24]/15 pt-6 text-sm text-[#1a1d24]/55"
          style={{ fontFamily: UI_FONT }}
        >
          <div className="mb-4 flex flex-wrap justify-center gap-4">
            <Link to="/terms" className="text-emerald-700 hover:underline">
              Terms of Service
            </Link>
            <Link to="/privacy" className="text-emerald-700 hover:underline">
              Privacy Policy
            </Link>
            <Link to="/refunds" className="text-emerald-700 hover:underline">
              Cancellation &amp; Refund Policy
            </Link>
          </div>
          <p className="text-center">
            {COPYRIGHT_FOOTER} ·{" "}
            <a href={LEGAL_CONTACT_MAILTO} className="text-emerald-700 underline">
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
  compact = false,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section id={id} className={compact ? "scroll-mt-2" : "scroll-mt-24"}>
      <h2
        className={
          compact
            ? "mb-2 text-sm font-semibold tracking-tight text-[#0f1b2d]"
            : "mb-4 text-2xl font-semibold tracking-tight text-[#0f1b2d] md:text-3xl"
        }
      >
        {title}
      </h2>
      <div className={compact ? "space-y-2 text-[13px] leading-relaxed" : "space-y-4"}>{children}</div>
    </section>
  );
}

export function LegalCallout({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "mb-3 rounded-md border border-emerald-700/25 bg-emerald-50 px-3 py-2.5 text-[13px] text-[#0f1b2d]"
          : "rounded-md border border-emerald-700/25 bg-emerald-50 px-5 py-4 text-[#0f1b2d]"
      }
      style={{ fontFamily: UI_FONT }}
    >
      {children}
    </div>
  );
}
