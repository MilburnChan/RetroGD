import { describe, expect, it } from "vitest";
import {
  MAX_AUTO_AI_RETRIES,
  canAutoAiRetry,
  computeAutoAiDelay,
  registerAutoAiFailure,
  registerAutoAiSuccess,
  type AutoAiRetryState
} from "../apps/web/src/lib/auto-ai-retry";

describe("auto ai retry", () => {
  it("retries with backoff and caps attempts", () => {
    const now = 1_000;
    let state: AutoAiRetryState | undefined;

    state = registerAutoAiFailure(state, now, "boom-1");
    expect(state.attempts).toBe(1);
    expect(state.nextRetryAt).toBe(now + computeAutoAiDelay(1));
    expect(canAutoAiRetry(state, now)).toBe(false);

    const afterDelay = state.nextRetryAt;
    expect(canAutoAiRetry(state, afterDelay)).toBe(true);

    state = registerAutoAiFailure(state, afterDelay, "boom-2");
    state = registerAutoAiFailure(state, state.nextRetryAt, "boom-3");

    expect(state.attempts).toBe(MAX_AUTO_AI_RETRIES);
    expect(canAutoAiRetry(state, state.nextRetryAt + 10_000)).toBe(false);
  });

  it("resets retry state after success", () => {
    const reset = registerAutoAiSuccess();
    expect(reset.attempts).toBe(0);
    expect(reset.lastError).toBeNull();
    expect(canAutoAiRetry(reset, 0)).toBe(true);
  });
});
