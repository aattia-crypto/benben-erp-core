/**
 * Extended organization profile (onboarding, fiscal, branding, email).
 * Local-first persistence — complements Prisma Settings when offline.
 */

import { readStorage, subscribeStorage, writeStorage } from "./storage";

export type OrgProfile = {
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  baseCurrency: string;
  taxRegion: string;
  loadDemoData: boolean;
  onboardingComplete: boolean;
};

export type CompanyBranding = {
  legalName: string;
  tagline: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  taxId: string;
  footerText: string;
  logoDataUrl?: string;
};

export type EmailSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  useTls: boolean;
  fromName: string;
  fromEmail: string;
};

const PROFILE_KEY = "benben.org.profile.v1";
const BRANDING_KEY = "benben.company.branding.v1";
const EMAIL_KEY = "benben.email.settings.v1";

const DEFAULT_PROFILE: OrgProfile = {
  fiscalYearStartMonth: 1,
  fiscalYearStartDay: 1,
  baseCurrency: "USD",
  taxRegion: "US",
  loadDemoData: true,
  onboardingComplete: false,
};

const DEFAULT_BRANDING: CompanyBranding = {
  legalName: "",
  tagline: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "USA",
  phone: "",
  email: "",
  taxId: "",
  footerText: "Thank you for your business.",
};

const DEFAULT_EMAIL: EmailSettings = {
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
  useTls: true,
  fromName: "Benben ERP",
  fromEmail: "",
};

let profileCache = { ...DEFAULT_PROFILE, ...readStorage(PROFILE_KEY, DEFAULT_PROFILE) };
let brandingCache = { ...DEFAULT_BRANDING, ...readStorage(BRANDING_KEY, DEFAULT_BRANDING) };
let emailCache = { ...DEFAULT_EMAIL, ...readStorage(EMAIL_KEY, DEFAULT_EMAIL) };

export function getOrgProfile(): OrgProfile {
  return profileCache;
}

export function updateOrgProfile(patch: Partial<OrgProfile>): OrgProfile {
  profileCache = { ...profileCache, ...patch };
  writeStorage(PROFILE_KEY, profileCache);
  return profileCache;
}

export function markOnboardingComplete(): OrgProfile {
  return updateOrgProfile({ onboardingComplete: true });
}

export function isOnboardingComplete(): boolean {
  return profileCache.onboardingComplete;
}

export function getCompanyBranding(): CompanyBranding {
  return brandingCache;
}

export function updateCompanyBranding(patch: Partial<CompanyBranding>): CompanyBranding {
  brandingCache = { ...brandingCache, ...patch };
  writeStorage(BRANDING_KEY, brandingCache);
  return brandingCache;
}

export function getEmailSettings(): EmailSettings {
  return emailCache;
}

export function updateEmailSettings(patch: Partial<EmailSettings>): EmailSettings {
  emailCache = { ...emailCache, ...patch };
  writeStorage(EMAIL_KEY, emailCache);
  return emailCache;
}

export function subscribeOrgProfile(fn: () => void): () => void {
  return subscribeStorage(PROFILE_KEY, () => {
    profileCache = { ...DEFAULT_PROFILE, ...readStorage(PROFILE_KEY, DEFAULT_PROFILE) };
    fn();
  });
}
