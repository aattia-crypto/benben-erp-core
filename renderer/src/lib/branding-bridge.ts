import type { BrandingDto, BrandingUpdatePayload } from "./branding-types";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRODUCT_SUBTITLE,
} from "./branding-types";
import {
  getCompanyBranding,
  getOrgProfile,
  updateCompanyBranding,
  updateOrgProfile,
} from "./org-profile";
import { getCompanyName } from "./workspace-store";

export function isDesktopBranding(): boolean {
  return typeof window !== "undefined" && !!window.benben?.branding;
}

function legacyToDto(): BrandingDto {
  const b = getCompanyBranding();
  const profile = getOrgProfile();
  const companyName = b.legalName || getCompanyName();
  const addrLine = [b.addressLine1, b.city, b.state, b.postalCode].filter(Boolean).join(" · ");
  return {
    companyName,
    tagline: b.tagline,
    productSubtitle: DEFAULT_PRODUCT_SUBTITLE,
    invoicePrefix: "",
    accentColor: DEFAULT_ACCENT_COLOR,
    reportHeader: {
      line1: companyName,
      line2: addrLine,
      line3: b.taxId ? `Tax ID: ${b.taxId}` : "",
    },
    documentFooter: b.footerText,
    logoDataUrl: b.logoDataUrl ?? null,
    address: {
      line1: b.addressLine1,
      line2: b.addressLine2,
      city: b.city,
      state: b.state,
      postalCode: b.postalCode,
      country: b.country,
    },
    contact: {
      phone: b.phone,
      email: b.email,
      taxId: b.taxId,
    },
    fiscal: {
      baseCurrency: profile.baseCurrency,
      taxRegion: profile.taxRegion,
      fiscalYearStartMonth: profile.fiscalYearStartMonth,
    },
    updatedAt: "",
  };
}

function syncLegacyStorage(dto: BrandingDto): void {
  updateCompanyBranding({
    legalName: dto.companyName,
    tagline: dto.tagline,
    addressLine1: dto.address.line1,
    addressLine2: dto.address.line2,
    city: dto.address.city,
    state: dto.address.state,
    postalCode: dto.address.postalCode,
    country: dto.address.country,
    phone: dto.contact.phone,
    email: dto.contact.email,
    taxId: dto.contact.taxId,
    footerText: dto.documentFooter,
    logoDataUrl: dto.logoDataUrl ?? undefined,
  });
  updateOrgProfile({
    baseCurrency: dto.fiscal.baseCurrency,
    taxRegion: dto.fiscal.taxRegion,
    fiscalYearStartMonth: dto.fiscal.fiscalYearStartMonth,
  });
}

export async function loadBranding(): Promise<BrandingDto> {
  if (isDesktopBranding()) {
    const res = await window.benben!.branding!.get();
    if (res.ok && res.data) {
      return res.data as BrandingDto;
    }
  }
  return legacyToDto();
}

export async function saveBranding(
  payload: BrandingUpdatePayload,
): Promise<{ ok: true; data: BrandingDto } | { ok: false; error: string }> {
  if (isDesktopBranding()) {
    const res = await window.benben!.branding!.update(payload);
    if (res.ok && res.data) {
      const dto = res.data as BrandingDto;
      syncLegacyStorage(dto);
      return { ok: true, data: dto };
    }
    return { ok: false, error: res.error ?? "Failed to save branding." };
  }

  const current = legacyToDto();
  const merged: BrandingDto = {
    ...current,
    ...payload,
    reportHeader: { ...current.reportHeader, ...payload.reportHeader },
    address: { ...current.address, ...payload.address },
    contact: { ...current.contact, ...payload.contact },
    fiscal: { ...current.fiscal, ...payload.fiscal },
    logoDataUrl:
      payload.logoDataUrl !== undefined ? payload.logoDataUrl : current.logoDataUrl,
  };
  syncLegacyStorage(merged);
  return { ok: true, data: merged };
}

export function applyAccentColor(accentColor: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--brand", accentColor);
}
