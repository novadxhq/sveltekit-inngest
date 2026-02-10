let denyUntilTs = 0;

/**
 * Enable temporary auth denial so per-message reauthorization can be tested.
 */
export const enableReauthDenyForMs = (durationMs: number) => {
  denyUntilTs = Date.now() + Math.max(0, durationMs);
};

/**
 * Clear demo reauth denial immediately.
 */
export const resetReauthDeny = () => {
  denyUntilTs = 0;
};

/**
 * Returns true while the test reauth denial window is active.
 */
export const isReauthDenyActive = () => Date.now() < denyUntilTs;
