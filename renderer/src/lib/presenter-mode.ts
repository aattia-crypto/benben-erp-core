import { isDevAuthBypass } from "./dev-auth-bypass";
import { isDemoBuild } from "./demo-build";

export function isPresenterMode(): boolean {
  return isDevAuthBypass() || isDemoBuild();
}
