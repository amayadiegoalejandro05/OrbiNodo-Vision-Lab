const LOCAL_VISION_SERVICE_URL = 'http://127.0.0.1:8765';
const DEPLOYED_HTTPS_ERROR = 'Vision Service requires an HTTPS endpoint in deployed mode.';

export interface VisionServiceConfiguration {
  url: string | null;
  error: string | null;
}

export function resolveVisionServiceConfiguration(
  configuredUrl: string | undefined,
  deployedMode: boolean,
): VisionServiceConfiguration {
  const url = (configuredUrl?.trim() || LOCAL_VISION_SERVICE_URL).replace(/\/$/, '');

  if (deployedMode && !url.startsWith('https://')) {
    return { url: null, error: DEPLOYED_HTTPS_ERROR };
  }

  return { url, error: null };
}

export const VISION_SERVICE_CONFIGURATION = resolveVisionServiceConfiguration(
  import.meta.env.VITE_VISION_SERVICE_URL,
  import.meta.env.PROD,
);
export const VISION_STATUS_POLL_MS = 400;
export const UNKNOWN_CONFIRMATION_READINGS = 3;
export const UNKNOWN_ALERT_COOLDOWN_MS = 15_000;

export function canStartVisionService(status: string): boolean { return status === 'Operativa'; }

export function createUnknownAlertConfirmation() {
  let consecutiveUnknown = 0;
  let lastAlertAt = Number.NEGATIVE_INFINITY;
  return {
    observe(hasUnknown: boolean, now: number): boolean {
      consecutiveUnknown = hasUnknown ? consecutiveUnknown + 1 : 0;
      if (!hasUnknown || consecutiveUnknown < UNKNOWN_CONFIRMATION_READINGS || now - lastAlertAt < UNKNOWN_ALERT_COOLDOWN_MS) return false;
      lastAlertAt = now;
      consecutiveUnknown = 0;
      return true;
    },
    reset(): void { consecutiveUnknown = 0; },
  };
}
