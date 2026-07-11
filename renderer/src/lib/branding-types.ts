/** Shared branding DTO shape (renderer ↔ desktop IPC). */

export type BrandingReportHeader = {
  line1: string;
  line2: string;
  line3: string;
};

export type BrandingAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type BrandingContact = {
  phone: string;
  email: string;
  taxId: string;
};

export type BrandingFiscal = {
  baseCurrency: string;
  taxRegion: string;
  fiscalYearStartMonth: number;
};

export type BrandingDto = {
  companyName: string;
  tagline: string;
  productSubtitle: string;
  invoicePrefix: string;
  accentColor: string;
  reportHeader: BrandingReportHeader;
  documentFooter: string;
  logoDataUrl: string | null;
  address: BrandingAddress;
  contact: BrandingContact;
  fiscal: BrandingFiscal;
  updatedAt: string;
};

export type BrandingUpdatePayload = Partial<
  Omit<BrandingDto, "logoDataUrl" | "updatedAt">
> & {
  logoDataUrl?: string | null;
};

export const DEFAULT_ACCENT_COLOR = "oklch(0.65 0.24 252)";
export const DEFAULT_PRODUCT_SUBTITLE = "ERP · Local-First";
