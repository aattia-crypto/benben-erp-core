/**
 * Commercial / premium licensing surface.
 *
 * Open-core builds do not import this barrel from Electron main.
 * Commercial flavors may soft-load it to restore Polar launch gating
 * and background heartbeat without changing core bootstrap.
 */
export {
  evaluatePolarVaultOnLaunch,
  startBackgroundLicenseHeartbeat,
  redirectToLicenseActivation,
  recordLicenseActivation,
  type LicenseLaunchGate,
  type LicenseNavigationOptions,
} from "./license-heartbeat.service";

export {
  verifyPolarLicenseOnline,
  type PolarActivatedLicense,
  type PolarVerifyResult,
} from "./polar-license.service";
