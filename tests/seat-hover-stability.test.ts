import { describe, expect, it } from "vitest";
import { HOVER_HYSTERESIS_PX, resolveHoverState, type HoverState } from "../apps/web/src/components/table/SeatArea";

describe("seat hover stability", () => {
  it("does not flap between neighboring cards near boundary jitter", () => {
    let state: HoverState = {
      hoveredIndex: null,
      lastPointerX: null
    };

    state = resolveHoverState(90, 10, 30, state, HOVER_HYSTERESIS_PX);
    expect(state.hoveredIndex).toBe(3);

    for (const pointerX of [104, 106, 108, 110]) {
      state = resolveHoverState(pointerX, 10, 30, state, HOVER_HYSTERESIS_PX);
      expect(state.hoveredIndex).toBe(3);
    }
  });

  it("switches card only after crossing hysteresis boundary", () => {
    let state: HoverState = {
      hoveredIndex: 3,
      lastPointerX: 95
    };

    state = resolveHoverState(111, 10, 30, state, HOVER_HYSTERESIS_PX);
    expect(state.hoveredIndex).toBe(3);

    state = resolveHoverState(112, 10, 30, state, HOVER_HYSTERESIS_PX);
    expect(state.hoveredIndex).toBe(4);

    state = resolveHoverState(100, 10, 30, state, HOVER_HYSTERESIS_PX);
    expect(state.hoveredIndex).toBe(4);

    state = resolveHoverState(98, 10, 30, state, HOVER_HYSTERESIS_PX);
    expect(state.hoveredIndex).toBe(3);
  });
});
