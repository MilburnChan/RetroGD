export interface AutoAiRetryState {
  attempts: number;
  lastError: string | null;
  nextRetryAt: number;
}

export const MAX_AUTO_AI_RETRIES = 3;

export const computeAutoAiDelay = (attempts: number): number => {
  return 850 + attempts * 500;
};

export const canAutoAiRetry = (state: AutoAiRetryState | undefined, now: number): boolean => {
  if (!state) return true;
  if (state.attempts >= MAX_AUTO_AI_RETRIES) return false;
  return now >= state.nextRetryAt;
};

export const registerAutoAiFailure = (
  state: AutoAiRetryState | undefined,
  now: number,
  message: string
): AutoAiRetryState => {
  const attempts = (state?.attempts ?? 0) + 1;
  return {
    attempts,
    lastError: message,
    nextRetryAt: now + computeAutoAiDelay(attempts)
  };
};

export const registerAutoAiSuccess = (): AutoAiRetryState => {
  return {
    attempts: 0,
    lastError: null,
    nextRetryAt: 0
  };
};
