import { describe, expect, it } from "vitest";
import {
  HAND_CARD_GAP,
  HAND_CARD_WIDTH,
  MIN_VISIBLE_STRIP,
  computeViewerHandLayout
} from "../apps/web/src/components/table/SeatArea";

describe("viewer hand layout", () => {
  it("uses normal spacing when container is wide enough", () => {
    const count = 10;
    const containerWidth = 1300;
    const layout = computeViewerHandLayout(containerWidth, count);

    expect(layout.allowScroll).toBe(false);
    expect(layout.step).toBe(HAND_CARD_WIDTH + HAND_CARD_GAP);
    expect(layout.contentWidth).toBe(HAND_CARD_WIDTH + (count - 1) * (HAND_CARD_WIDTH + HAND_CARD_GAP));
  });

  it("compresses spacing but keeps visible strip at or above minimum", () => {
    const layout = computeViewerHandLayout(900, 10);
    expect(layout.step).toBeGreaterThanOrEqual(MIN_VISIBLE_STRIP);
    expect(layout.allowScroll).toBe(false);
  });

  it("enables horizontal scroll when even min visible strip cannot fit", () => {
    const layout = computeViewerHandLayout(200, 27);
    expect(layout.allowScroll).toBe(true);
    expect(layout.step).toBe(MIN_VISIBLE_STRIP);
    expect(layout.contentWidth).toBe(HAND_CARD_WIDTH + 26 * MIN_VISIBLE_STRIP);
  });
});
