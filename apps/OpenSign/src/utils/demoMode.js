// Demo-mode detection (frontend).
//
// Returns true only when the app is running on the host configured as the
// demo hostname via the runtime env var `DEMO_HOSTNAME` (see entrypoint.sh).
// For a typical client deployment, `DEMO_HOSTNAME` is not set, so this is
// always false and the demo UI (banner, etc.) is inert.
import { getEnv } from "../constant/Utils";

export function isDemoHost() {
  try {
    const demoHost = (getEnv()?.DEMO_HOSTNAME || "").trim();
    if (!demoHost) return false;
    return window?.location?.host === demoHost;
  } catch {
    return false;
  }
}
